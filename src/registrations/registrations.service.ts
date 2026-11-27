import { Injectable } from "@nestjs/common";
import { ApplicationsRepository } from "../applications/applications.repository.js";
import { type AdminScope, adminScopeOf, OUTSIDE_VILLAGES, SUPER_ADMIN_SCOPE, villageAllowed } from "../common/admin-access/admin-scope.js";
import { DEFAULT_LIMIT } from "../common/dto/list-query.dto.js";
import { bindsToFamily, FAMILY_ACCOUNT_STUDENT_REGISTRATION, loginAccount } from "../common/eligibility/login-account.js";
import { ApiError } from "../common/filters/api-error.js";
import { adminNewApplicationEmail } from "../common/mail/email-templates.js";
import { MailService } from "../common/mail/mail.service.js";
import { ApplicantNotifier, type Outbound } from "../common/messaging/applicant-notifier.service.js";
import { MessagingService } from "../common/messaging/messaging.service.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { normalizeMobile } from "../common/utils/text.js";
import { AppConfigService } from "../config/app-config.service.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Application, Prisma, StudentApplication, Transaction } from "../generated/prisma/client.js";
import { AvailabilityService } from "../lookups/availability.service.js";
import { asLang, type Lang, type NotificationKey, userNotification, workflowNotification } from "../notifications/notification-texts.js";
import { NotificationsRepository } from "../notifications/notifications.repository.js";
import { StudentApplicationsRepository } from "../student-applications/student-applications.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { toTransactionVo } from "../transactions/vo/transactions.vo.js";
import type { PaymentEditDto, PaymentReviewDto, RegistrationDto, RegistrationPaymentsQueryDto } from "./dto/registrations.dto.js";
import { PaymentFilesService } from "./payment-files.service.js";
import {
  birthDateError,
  canResubmit,
  FEE_TYPES,
  FEES,
  isoDateOnly,
  isSchoolClass,
  type PaymentDecision,
  paymentDecisionAllowed,
  profileCompletion,
  type RegistrationType,
  SCHOOL_CLASS_ERROR,
  STUDENT_CITY,
  STUDENT_INDORE_ERROR,
} from "./registration.rules.js";

type AnyApplication = { type: "FAMILY"; row: Application } | { type: "STUDENT"; row: StudentApplication };

const logMail = (error: unknown) => console.error("[mailer] registration email failed:", error instanceof Error ? error.message : error);

export const ALREADY_IN_FAMILY = "Your account already belongs to an active family on the portal, so it can't register another family.";

// Account-first registration: a logged-in (mobile-verified) user submits the short family or student form
// with proof of the UPI payment; admins verify the payment, then approve the application as before.
@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsRepository,
    private readonly studentApplications: StudentApplicationsRepository,
    private readonly transactions: TransactionsRepository,
    private readonly notifications: NotificationsRepository,
    private readonly availability: AvailabilityService,
    private readonly files: PaymentFilesService,
    private readonly notifier: ApplicantNotifier,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly messaging: MessagingService,
  ) {}

  async uploadScreenshot(user: UserRow, file: Express.Multer.File | undefined): Promise<{ fileId: string }> {
    return { fileId: await this.files.save(user.id, file) };
  }

  // The user's registrations with their payment, plus the fees and profile completion.
  async mine(user: UserRow) {
    const own = await this.ownApplications(user.id);
    const fees = await this.transactions.feesFor(own.map((app) => app.row.applicationId));
    return {
      fees: FEES,
      registrations: own.map((app) => this.view(app, fees.find((fee) => fee.referenceId === app.row.applicationId) ?? null)),
      completion: await this.completion(user, own, fees),
    };
  }

  async submit(user: UserRow, dto: RegistrationDto) {
    assertNoMarkup(dto);
    const type = dto.type as RegistrationType;
    const mobile = this.mobileOf(user);
    const dob = this.birthDate(dto.dob, dto.type as RegistrationType);
    if (type === "STUDENT" && dto.city !== STUDENT_CITY) throw new ApiError(400, STUDENT_INDORE_ERROR);
    // A Family Member account can't also become a student: the student needs their own Student Login. (A student who
    // registers as a family member is the supported upgrade: approval moves them into the family.)
    if (type === "STUDENT" && bindsToFamily(await loginAccount(this.prisma, user))) throw new ApiError(409, FAMILY_ACCOUNT_STUDENT_REGISTRATION);
    const own = await this.ownApplications(user.id);
    if (own.some((app) => app.type === type && app.row.status !== "REJECTED"))
      throw new ApiError(
        409,
        type === "FAMILY" ? "You already have a family registration application." : "You already have a student registration application.",
      );
    if (type === "FAMILY" && (await this.availability.isMobileTaken(mobile)))
      throw new ApiError(409, "This mobile number is already registered with a family on the portal.");
    // The mobile alone isn't enough: an account already tied to an active family by its email can't register another.
    if (type === "FAMILY") {
      const account = await loginAccount(this.prisma, user);
      if (account.type === "FAMILY" && account.status === "ACTIVE") throw new ApiError(409, ALREADY_IN_FAMILY);
    }
    if (type === "STUDENT" && (await this.availability.isStudentMobileTaken(mobile)))
      throw new ApiError(409, "This mobile number is already registered as a student on the portal.");
    const screenshotFile = await this.files.claim(user.id, dto.screenshotFileId);
    const lang = asLang(dto.lang);
    const created = await this.prisma.$transaction(async (tx) => {
      const application: AnyApplication =
        type === "FAMILY"
          ? {
              type,
              row: await createWithDisplayId(
                `NPSI-APP-${new Date().getFullYear()}-`,
                (prefix) => this.applications.latestDisplayIds(prefix, tx),
                (applicationId) => this.applications.create({ id: randomId(), applicationId, ...this.familyData(user, mobile, dto, dob), lang }, tx),
              ),
            }
          : {
              type,
              row: await createWithDisplayId(
                `NPSI-STU-APP-${new Date().getFullYear()}-`,
                (prefix) => this.studentApplications.latestDisplayIds(prefix, tx),
                (applicationId) => this.studentApplications.create({ id: randomId(), applicationId, ...this.studentData(user, mobile, dto, dob), lang }, tx),
              ),
            };
      const fee = await createWithDisplayId(
        "TXN-",
        (prefix) => this.transactions.latestDisplayIds(prefix, tx),
        (transactionId) =>
          this.transactions.create(
            {
              id: randomId(),
              transactionId,
              type: FEE_TYPES[type],
              amount: FEES[type],
              paymentMethod: "UPI",
              paymentStatus: "SUBMITTED",
              referenceId: application.row.applicationId,
              date: new Date(),
              remarks: `${FEE_TYPES[type]} fee (UPI QR)`,
              screenshotFile,
              utr: dto.utr?.trim() || null,
            },
            tx,
          ),
      );
      const key: NotificationKey = type === "FAMILY" ? "applicationSubmitted" : "studentApplicationSubmitted";
      await this.notifications.create(userNotification(key, user.id, { applicationId: application.row.applicationId }, lang), tx);
      return { application, fee };
    });
    const { application, fee } = created;
    this.afterSubmit(user, application, "applicationSubmitted", lang).catch(logMail);
    return this.view(application, fee);
  }

  // Changes after the admin asked for a correction or rejected the payment; goes back to verification.
  async resubmit(user: UserRow, id: string, dto: RegistrationDto) {
    assertNoMarkup(dto);
    const application = (await this.ownApplications(user.id)).find((app) => app.row.id === id);
    if (!application || application.type !== dto.type) throw new ApiError(404, "Record not found");
    const fee = await this.transactions.feeFor(application.row.applicationId);
    if (!canResubmit(application.row.status, fee?.paymentStatus)) throw new ApiError(409, "This application can't be changed now.");
    const needsPayment = fee?.paymentStatus === "REJECTED" || !fee;
    if (needsPayment && !dto.screenshotFileId) throw new ApiError(400, "Please upload the payment screenshot again.");
    const screenshotFile = dto.screenshotFileId ? await this.files.claim(user.id, dto.screenshotFileId) : null;
    const mobile = this.mobileOf(user);
    const dob = this.birthDate(dto.dob, dto.type as RegistrationType);
    const lang = asLang(dto.lang);
    const result = await this.prisma.$transaction(async (tx) => {
      const status = { status: "PENDING_VERIFICATION", submittedDate: new Date(), lang };
      const updated: AnyApplication =
        application.type === "FAMILY"
          ? { type: "FAMILY", row: (await this.applications.update(id, { ...this.familyData(user, mobile, dto, dob), ...status }, tx)) as Application }
          : {
              type: "STUDENT",
              row: (await this.studentApplications.update(id, { ...this.studentData(user, mobile, dto, dob), ...status }, tx)) as StudentApplication,
            };
      let payment: Transaction | null = fee;
      if (screenshotFile) {
        const paymentData = {
          screenshotFile,
          utr: dto.utr?.trim() || null,
          paymentStatus: "SUBMITTED",
          adminRemarks: null,
          reviewedAt: null,
          reviewedBy: null,
        };
        payment = fee
          ? await this.transactions.update(fee.id, paymentData, tx)
          : await this.newFee(application.type, updated.row.applicationId, paymentData, tx);
      }
      await this.notifications.create(userNotification("registrationResubmitted", user.id, { applicationId: updated.row.applicationId }, lang), tx);
      return { updated, payment };
    });
    if (screenshotFile && fee?.screenshotFile) await this.files.remove(fee.screenshotFile);
    this.afterSubmit(user, result.updated, "registrationResubmitted", lang).catch(logMail);
    return this.view(result.updated, result.payment);
  }

  // Admin: registration-fee payments with who paid, the application's state and which admin reviewed it.
  // A staff member sees the fees of family registrations from their villages (student fees only with all villages).
  async payments(query: RegistrationPaymentsQueryDto, scope: AdminScope = SUPER_ADMIN_SCOPE) {
    const rows = await this.transactions.registrationFees(query.status, query.limit ?? DEFAULT_LIMIT, query.offset);
    const ids = rows.map((row) => row.referenceId).filter((id): id is string => Boolean(id));
    const reviewerIds = [...new Set(rows.map((row) => row.reviewedBy).filter((id): id is string => Boolean(id)))];
    const [families, students, reviewers] = await Promise.all([
      ids.length ? this.prisma.application.findMany({ where: { applicationId: { in: ids } } }) : [],
      ids.length ? this.prisma.studentApplication.findMany({ where: { applicationId: { in: ids } } }) : [],
      reviewerIds.length ? this.prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, fullName: true, email: true } }) : [],
    ]);
    const inScope = (row: (typeof rows)[number]) => {
      if (scope.allVillages) return true;
      const family = families.find((app) => app.applicationId === row.referenceId);
      return Boolean(family && villageAllowed(scope, family.village, family.nativePlace));
    };
    return rows.filter(inScope).map((row) => {
      const family = families.find((app) => app.applicationId === row.referenceId);
      const student = students.find((app) => app.applicationId === row.referenceId);
      const reviewer = reviewers.find((user) => user.id === row.reviewedBy);
      return {
        ...toTransactionVo(row),
        // The admin who verified / rejected / refunded the payment (name, else email).
        reviewer: row.reviewedBy ? { id: row.reviewedBy, name: reviewer?.fullName || reviewer?.email || null } : null,
        applicant: family
          ? { type: "FAMILY", id: family.id, name: family.familyHeadName, mobile: family.mobile, email: family.email, status: family.status }
          : student
            ? { type: "STUDENT", id: student.id, name: student.studentName, mobile: student.mobile, email: student.email, status: student.status }
            : null,
      };
    });
  }

  // Super admin corrections: amount, UTR and remarks only (the status changes through reviewPayment).
  async editPayment(id: string, dto: PaymentEditDto) {
    const fee = await this.transactions.findById(id);
    if (!fee || !Object.values(FEE_TYPES).includes(fee.type)) throw new ApiError(404, "Registration payment not found.");
    assertNoMarkup(dto);
    const data: Prisma.TransactionUncheckedUpdateInput = {
      ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
      ...(dto.utr !== undefined ? { utr: dto.utr?.trim() || null } : {}),
      ...(dto.adminRemarks !== undefined ? { adminRemarks: dto.adminRemarks?.trim() || null } : {}),
    };
    const row = await this.transactions.update(id, data);
    if (!row) throw new ApiError(404, "Registration payment not found.");
    return toTransactionVo(row);
  }

  // Super admin: delete a registration payment (the audit log keeps a copy). Not while its application still awaits a
  // decision: without the fee record it could be approved without payment. Reject the payment instead.
  async deletePayment(id: string): Promise<void> {
    const fee = await this.transactions.findById(id);
    if (!fee || !Object.values(FEE_TYPES).includes(fee.type)) throw new ApiError(404, "Registration payment not found.");
    const application = await this.applicationFor(fee.referenceId);
    if (application && !["APPROVED", "REJECTED"].includes(application.row.status || ""))
      throw new ApiError(409, "This application is still waiting for a decision. Reject the payment (or decide the application) instead of deleting it.");
    await this.transactions.delete(id);
  }

  async reviewPayment(id: string, dto: PaymentReviewDto, admin: UserRow, scope: AdminScope = SUPER_ADMIN_SCOPE) {
    const decision = dto.decision as PaymentDecision;
    const remarks = dto.remarks?.trim() || null;
    if (decision !== "VERIFIED" && !remarks) throw new ApiError(400, "Remarks are required for this payment decision.");
    const refundReference = dto.refundReference?.trim() || null;
    let outbound: Outbound | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const fee = await this.transactions.findById(id, tx);
      if (!fee || !Object.values(FEE_TYPES).includes(fee.type)) throw new ApiError(404, "Registration payment not found.");
      if (!paymentDecisionAllowed(fee.paymentStatus, decision)) throw new ApiError(409, `This payment is already ${fee.paymentStatus ?? "PENDING"}.`);
      if (decision === "REFUNDED") {
        if (!refundReference || !dto.refundAmount || dto.refundAmount > fee.amount.toNumber())
          throw new ApiError(400, "Enter a valid refund amount and the actual refund transaction reference before completing the refund.");
      }
      const application = await this.applicationFor(fee.referenceId, tx);
      if (!this.feeInScope(scope, application)) throw new ApiError(403, OUTSIDE_VILLAGES);
      if (decision === "REJECTED" && application?.row.status === "APPROVED")
        throw new ApiError(409, "The application is already approved; refund the payment instead of rejecting it.");
      // A full refund of an approved registration takes back what it paid for: the family (or student record) it created
      // is suspended for the admin to review, instead of staying active with full member access.
      let refundNote: string | null = null;
      if (decision === "REFUNDED" && application?.row.status === "APPROVED" && Number(dto.refundAmount) >= fee.amount.toNumber()) {
        refundNote = "Registration fee fully refunded; the registration was suspended for admin review.";
        if (application.type === "FAMILY" && application.row.resultingFamilyId) {
          await tx.family.updateMany({ where: { familyId: application.row.resultingFamilyId, status: "ACTIVE" }, data: { status: "SUSPENDED" } });
        } else if (application.type === "STUDENT" && application.row.resultingStudentId) {
          await tx.student.updateMany({ where: { studentId: application.row.resultingStudentId, status: "ACTIVE" }, data: { status: "INACTIVE" } });
        }
      }
      const row = await this.transactions.update(
        id,
        {
          paymentStatus: decision,
          adminRemarks: refundNote ? [remarks, refundNote].filter(Boolean).join(" | ") : remarks,
          reviewedBy: admin.id,
          reviewedAt: new Date(),
          ...(decision === "REFUNDED" ? { refundAmount: dto.refundAmount, refundReference } : {}),
        },
        tx,
      );
      if (application) {
        const key: NotificationKey =
          decision === "VERIFIED"
            ? "paymentVerified"
            : decision === "REJECTED"
              ? "paymentRejected"
              : decision === "REFUNDED"
                ? "paymentRefunded"
                : decision === "REFUND_REJECTED"
                  ? "paymentRefundRejected"
                  : "paymentRefundRequested";
        const lang = application.row.lang ? asLang(application.row.lang) : (dto.lang ?? "en");
        const vars = {
          amount: (decision === "REFUNDED" ? Number(dto.refundAmount) : fee.amount.toNumber()).toString(),
          applicationId: application.row.applicationId,
          remarks,
          status: decision === "REFUND_PROCESSING" ? "being processed" : decision === "REFUND_REJECTED" ? "rejected" : "requested",
        };
        await this.notifications.create(
          application.row.userId
            ? userNotification(key, application.row.userId, vars, lang)
            : workflowNotification(key, application.row.applicationId, vars, lang),
          tx,
        );
        const name = application.type === "FAMILY" ? application.row.familyHeadName : application.row.studentName;
        outbound = { key, vars, lang, name, email: application.row.email, mobile: application.row.mobile };
      }
      return row as Transaction;
    });
    if (outbound) await this.notifier.deliver([outbound]);
    return toTransactionVo(updated);
  }

  // The payment screenshot, for an admin or the applicant who uploaded it.
  // For an admin, a staff member with payment access for that registration's village, or the applicant who uploaded it.
  async screenshot(id: string, user: UserRow) {
    const fee = await this.transactions.findById(id);
    if (!fee?.screenshotFile) throw new ApiError(404, "Record not found");
    if (user.role !== "admin") {
      const application = await this.applicationFor(fee.referenceId);
      const scope = await adminScopeOf(this.prisma, user);
      const staff = scope?.areas.includes("PAYMENTS") && this.feeInScope(scope, application);
      if (!staff && application?.row.userId !== user.id) throw new ApiError(404, "Record not found");
    }
    return this.files.read(fee.screenshotFile);
  }

  // Whether a registration fee belongs to the admin scope: a family registration from one of its villages, or any
  // registration for an admin with all villages.
  private feeInScope(scope: AdminScope, application: AnyApplication | null): boolean {
    if (scope.allVillages) return true;
    return application?.type === "FAMILY" && villageAllowed(scope, application.row.village, application.row.nativePlace);
  }

  async completionFor(user: UserRow) {
    const own = await this.ownApplications(user.id);
    return this.completion(user, own, await this.transactions.feesFor(own.map((app) => app.row.applicationId)));
  }

  private async completion(user: UserRow, own: AnyApplication[], fees: Transaction[]) {
    const latest = own.find((app) => app.row.status !== "REJECTED") ?? own[0] ?? null;
    const fee = latest ? fees.find((row) => row.referenceId === latest.row.applicationId) : null;
    const family = await this.prisma.family.findFirst({
      where: { status: "ACTIVE", OR: [{ ownerUserId: user.id }, ...(user.email ? [{ email: user.email }] : [])] },
      select: { familyId: true },
    });
    const student = await this.prisma.student.findFirst({
      where: { OR: [{ userId: user.id }, ...(user.email ? [{ email: user.email }] : [])] },
      select: { course: true, institution: true },
    });
    const members = family?.familyId
      ? await this.prisma.familyMember.findMany({ where: { familyId: family.familyId }, select: { relationship: true, education: true, occupation: true } })
      : [];
    const head = members.find((member) => member.relationship.toLowerCase() === "head") ?? members[0];
    const isFamily = Boolean(family) || latest?.type === "FAMILY" || (!latest && !student);
    return profileCompletion({
      // Without WhatsApp / SMS configured no code can reach a mobile, so the step is left out instead of never finishing.
      mobileVerified: this.messaging.otpConfigured() ? Boolean(user.phone && user.phoneVerified) : null,
      hasEmail: Boolean(user.email),
      hasPhoto: Boolean(user.photoUrl),
      registration: latest ? { status: latest.row.status, paymentStatus: fee?.paymentStatus ?? null } : null,
      approved: Boolean(family || student),
      familyMembers: isFamily ? members.length : null,
      headDetails: isFamily ? Boolean(head?.education && head?.occupation) : Boolean(student?.course && student?.institution),
    });
  }

  private view(app: AnyApplication, fee: Transaction | null) {
    const row = app.row;
    const common = {
      type: app.type,
      id: row.id,
      applicationId: row.applicationId,
      status: row.status,
      adminRemarks: row.adminRemarks,
      submittedDate: row.submittedDate,
      reviewedDate: row.reviewedDate,
      canResubmit: canResubmit(row.status, fee?.paymentStatus),
      payment: fee
        ? {
            id: fee.id,
            transactionId: fee.transactionId,
            amount: fee.amount.toNumber(),
            status: fee.paymentStatus,
            utr: fee.utr,
            adminRemarks: fee.adminRemarks,
            refundAmount: fee.refundAmount?.toNumber() ?? null,
            refundReference: fee.refundReference,
            reviewedAt: fee.reviewedAt,
            hasScreenshot: Boolean(fee.screenshotFile),
          }
        : null,
    };
    if (app.type === "FAMILY") {
      const head = (Array.isArray(app.row.membersData) ? app.row.membersData[0] : null) as Record<string, string> | null;
      return {
        ...common,
        resultId: app.row.resultingFamilyId,
        form: {
          ...splitName(app.row.familyHeadName, app.row.familyName),
          gender: head?.gender ?? "",
          dob: head?.dob ?? "",
          maritalStatus: head?.maritalStatus ?? "",
          bloodGroup: app.row.bloodGroup ?? "",
          ...this.formAddress(app.row),
        },
      };
    }
    return {
      ...common,
      resultId: app.row.resultingStudentId,
      form: {
        ...splitName(app.row.studentName),
        gender: app.row.gender ?? "",
        dob: isoDateOnly(app.row.dob) ?? "",
        education: app.row.educationLevel ?? "",
        bloodGroup: app.row.bloodGroup ?? "",
        ...this.formAddress(app.row),
      },
    };
  }

  private formAddress(row: { address: string | null; city: string | null; pincode: string | null; village?: string | null }) {
    const [address = "", area = ""] = splitAddress(row.address);
    return { city: row.city ?? "", area, address, pincode: row.pincode ?? "", nativeVillage: row.village ?? nativeFrom(row.address) };
  }

  private async ownApplications(userId: string): Promise<AnyApplication[]> {
    const [families, students] = await Promise.all([
      this.prisma.application.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
      this.prisma.studentApplication.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
    ]);
    return [...families.map((row) => ({ type: "FAMILY" as const, row })), ...students.map((row) => ({ type: "STUDENT" as const, row }))].sort(
      (a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime(),
    );
  }

  private async applicationFor(applicationId: string | null, db: Db = this.prisma): Promise<AnyApplication | null> {
    if (!applicationId) return null;
    const family = await db.application.findFirst({ where: { applicationId } });
    if (family) return { type: "FAMILY", row: family };
    const student = await db.studentApplication.findFirst({ where: { applicationId } });
    return student ? { type: "STUDENT", row: student } : null;
  }

  private newFee(type: RegistrationType, applicationId: string, data: Record<string, unknown>, tx: Db) {
    return createWithDisplayId(
      "TXN-",
      (prefix) => this.transactions.latestDisplayIds(prefix, tx),
      (transactionId) =>
        this.transactions.create(
          {
            id: randomId(),
            transactionId,
            type: FEE_TYPES[type],
            amount: FEES[type],
            paymentMethod: "UPI",
            referenceId: applicationId,
            date: new Date(),
            ...data,
          },
          tx,
        ),
    );
  }

  private mobileOf(user: UserRow): string {
    const mobile = normalizeMobile(user.phone);
    if (!/^[6-9]\d{9}$/.test(mobile)) throw new ApiError(400, "Add your 10-digit mobile number in your profile before registering.");
    return mobile;
  }

  private birthDate(value: string, type: RegistrationType): Date {
    const error = birthDateError(value, type);
    if (error) throw new ApiError(400, error);
    return new Date(`${value}T00:00:00Z`);
  }

  private address(dto: RegistrationDto) {
    const district = dto.city === "Other" ? null : dto.city;
    return {
      address: `${dto.address.trim()}, ${dto.area.trim()}`,
      city: dto.city,
      district,
      state: district ? "Madhya Pradesh" : null,
      pincode: dto.pincode,
    };
  }

  private familyData(user: UserRow, mobile: string, dto: RegistrationDto, dob: Date) {
    const name = `${dto.firstName.trim()} ${dto.lastName.trim()}`;
    const village = dto.nativeVillage.trim();
    return {
      status: "PENDING_VERIFICATION",
      familyHeadName: name,
      familyName: dto.lastName.trim(),
      mobile,
      email: user.email,
      ...this.address(dto),
      nativePlace: village,
      village,
      membersData: [
        { name, relationship: "Head", gender: dto.gender, dob: isoDateOnly(dob), mobile, email: user.email ?? "", maritalStatus: dto.maritalStatus ?? "" },
      ],
      bloodGroup: dto.bloodGroup || null,
      submittedDate: new Date(),
      userId: user.id,
    };
  }

  private studentData(user: UserRow, mobile: string, dto: RegistrationDto, dob: Date) {
    if (isSchoolClass(dto.education)) throw new ApiError(400, SCHOOL_CLASS_ERROR);
    if (dto.city !== STUDENT_CITY) throw new ApiError(400, STUDENT_INDORE_ERROR);
    const base = this.address(dto);
    return {
      status: "PENDING_VERIFICATION",
      studentName: `${dto.firstName.trim()} ${dto.lastName.trim()}`,
      mobile,
      email: user.email,
      dob,
      gender: dto.gender,
      educationLevel: dto.education?.trim() || null,
      bloodGroup: dto.bloodGroup || null,
      ...base,
      // Student records have no village column; the native village is kept with the address.
      address: `${base.address} (${NATIVE_LABEL} ${dto.nativeVillage.trim()})`,
      submittedDate: new Date(),
      userId: user.id,
    };
  }

  // Admins hear about every new / changed registration; the applicant gets email + WhatsApp.
  private async afterSubmit(user: UserRow, application: AnyApplication, key: NotificationKey, lang: Lang): Promise<void> {
    const name = application.type === "FAMILY" ? application.row.familyHeadName : application.row.studentName;
    const applicationKey: NotificationKey = key === "applicationSubmitted" && application.type === "STUDENT" ? "studentApplicationSubmitted" : key;
    await this.notifier.deliver([
      { key: applicationKey, vars: { applicationId: application.row.applicationId }, lang, name, email: user.email, mobile: application.row.mobile },
    ]);
    const notice = adminNewApplicationEmail({
      name,
      email: user.email,
      phone: application.row.mobile,
      applicationId: application.row.applicationId,
      familyName: application.type === "FAMILY" ? application.row.familyName : "Student registration",
      city: application.row.city,
      registeredAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    });
    await this.mail.send({ to: this.config.adminEmails.join(","), subject: notice.subject, html: notice.html, text: notice.text });
  }
}

const NATIVE_LABEL = "Native village / मूल गाँव:";
const splitName = (full: string, last?: string) => {
  const name = full.trim();
  if (last && name.endsWith(` ${last}`)) return { firstName: name.slice(0, -last.length - 1), lastName: last };
  const at = name.lastIndexOf(" ");
  return at > 0 ? { firstName: name.slice(0, at), lastName: name.slice(at + 1) } : { firstName: name, lastName: "" };
};
const splitAddress = (value: string | null): [string, string] => {
  const text = (value ?? "").replace(/\s*\(Native village \/ मूल गाँव:[^)]*\)\s*$/, "");
  const at = text.lastIndexOf(", ");
  return at > 0 ? [text.slice(0, at), text.slice(at + 2)] : [text, ""];
};
const nativeFrom = (value: string | null): string => /\(Native village \/ मूल गाँव: ([^)]*)\)/.exec(value ?? "")?.[1] ?? "";
