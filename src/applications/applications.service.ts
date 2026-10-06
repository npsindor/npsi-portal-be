import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { adminNewApplicationEmail, memberWelcomeEmail } from "../common/mail/email-templates.js";
import { MailService } from "../common/mail/mail.service.js";
import { RECAPTCHA_FAILED, RecaptchaService } from "../common/recaptcha/recaptcha.service.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import { toJsonInput } from "../common/utils/json.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { blank, EMAIL_PATTERN, normalizeMobile } from "../common/utils/text.js";
import { AppConfigService } from "../config/app-config.service.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AvailabilityService } from "../lookups/availability.service.js";
import { workflowNotification } from "../notifications/notification-texts.js";
import { NotificationsRepository } from "../notifications/notifications.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { ApplicationsRepository } from "./applications.repository.js";
import type { ApplicationListQueryDto, CreateApplicationDto, UpdateApplicationDto } from "./dto/applications.dto.js";
import { type ApplicationVo, toApplicationVo } from "./vo/applications.vo.js";

// The family registration fee (no payment gateway: recorded as PENDING for admins to reconcile).
export const REGISTRATION_FEE = 500;

// Family registration applications. Anyone may submit one (public form with
// reCAPTCHA); it always starts PENDING_VERIFICATION and admins review it. A
// public submission also records the registration fee and a "submitted"
// notification, in the same transaction.
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ApplicationsRepository,
    private readonly transactions: TransactionsRepository,
    private readonly notifications: NotificationsRepository,
    private readonly availability: AvailabilityService,
    private readonly recaptcha: RecaptchaService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async list(query: ApplicationListQueryDto): Promise<ApplicationVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toApplicationVo);
  }

  async create(dto: CreateApplicationDto, user: UserRow | null): Promise<ApplicationVo> {
    const { recaptchaToken, lang, ...input } = dto;
    const isPublic = user?.role !== "admin";
    if (isPublic) {
      assertNoMarkup(input);
      input.status = "PENDING_VERIFICATION";
      delete input.adminRemarks;
      delete input.reviewedDate;
      delete input.resultingFamilyId;
    }
    if (!(await this.recaptcha.verify(recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    await this.validate(input);
    const row = await this.prisma.$transaction(async (tx) => {
      const application = await createWithDisplayId(
        `NPSI-APP-${new Date().getFullYear()}-`,
        (prefix) => this.repo.latestDisplayIds(prefix, tx),
        (applicationId) => this.repo.create({ id: randomId(), applicationId, ...toCreateData(input) }, tx),
      );
      if (isPublic) {
        await createWithDisplayId(
          "TXN-",
          (prefix) => this.transactions.latestDisplayIds(prefix, tx),
          (transactionId) =>
            this.transactions.create(
              {
                id: randomId(),
                transactionId,
                type: "Family Registration",
                amount: REGISTRATION_FEE,
                paymentMethod: "UPI",
                paymentStatus: "PENDING",
                referenceId: application.applicationId,
                date: new Date(),
                remarks: "Family registration fee",
              },
              tx,
            ),
        );
        const { applicationId } = application;
        await this.notifications.create(workflowNotification("applicationSubmitted", applicationId, { applicationId }, lang), tx);
      }
      return application;
    });
    const application = toApplicationVo(row);
    this.sendEmails(application).catch((error: unknown) => console.error("[mailer] application email failed:", error instanceof Error ? error.message : error));
    return application;
  }

  async update(id: string, dto: UpdateApplicationDto): Promise<ApplicationVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toApplicationVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  private async validate(input: Omit<CreateApplicationDto, "recaptchaToken" | "lang">): Promise<void> {
    if (!input.mobile || normalizeMobile(input.mobile).length !== 10) throw new ApiError(400, "A valid 10-digit mobile number is required.");
    if (blank(input.familyName)) throw new ApiError(400, "Family name is required.");
    if (!input.email || !EMAIL_PATTERN.test(input.email)) throw new ApiError(400, "A valid email address is required.");
    if (blank(input.address)) throw new ApiError(400, "Address is required.");
    if (blank(input.city)) throw new ApiError(400, "City is required.");
    if (blank(input.district)) throw new ApiError(400, "District is required.");
    if (blank(input.familyHeadName)) throw new ApiError(400, "Family head name is required.");
    if (await this.availability.isMobileTaken(input.mobile)) throw new ApiError(409, "This mobile number is already registered on the portal.");
    if (await this.availability.isEmailTaken(input.email)) throw new ApiError(409, "This email is already registered on the portal.");
  }

  // Welcome email to the applicant, notice to the admins.
  private async sendEmails(application: ApplicationVo): Promise<void> {
    const name = application.familyHeadName || "Member";
    if (application.email) {
      const welcome = memberWelcomeEmail({ name, loginUrl: `${this.config.frontendUrl}/login` });
      await this.mail.send({ to: application.email, subject: welcome.subject, html: welcome.html, text: welcome.text });
    }
    const notice = adminNewApplicationEmail({
      name,
      email: application.email,
      phone: application.mobile,
      applicationId: application.applicationId,
      familyName: application.familyName,
      city: application.city,
      registeredAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    });
    await this.mail.send({ to: this.config.adminEmails.join(","), subject: notice.subject, html: notice.html, text: notice.text });
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
// Required columns are checked by validate() first.
const toCreateData = (input: Omit<CreateApplicationDto, "recaptchaToken" | "lang">): Omit<Prisma.ApplicationUncheckedCreateInput, "id" | "applicationId"> => ({
  status: input.status,
  familyHeadName: input.familyHeadName as string,
  mobile: input.mobile,
  email: input.email,
  familyName: input.familyName as string,
  address: input.address,
  city: input.city,
  district: input.district,
  state: input.state,
  pincode: input.pincode,
  gotra: input.gotra,
  nativePlace: input.nativePlace,
  village: input.village,
  membersData: toJsonInput(input.membersData),
  submittedDate: parseDate(input.submittedDate),
  adminRemarks: input.adminRemarks,
  reviewedDate: parseDate(input.reviewedDate),
  resultingFamilyId: input.resultingFamilyId,
});

const toUpdateData = (input: UpdateApplicationDto): Prisma.ApplicationUncheckedUpdateInput => ({
  status: input.status,
  familyHeadName: input.familyHeadName,
  mobile: input.mobile,
  email: input.email,
  familyName: input.familyName,
  address: input.address,
  city: input.city,
  district: input.district,
  state: input.state,
  pincode: input.pincode,
  gotra: input.gotra,
  nativePlace: input.nativePlace,
  village: input.village,
  membersData: toJsonInput(input.membersData),
  submittedDate: parseDate(input.submittedDate),
  adminRemarks: input.adminRemarks,
  reviewedDate: parseDate(input.reviewedDate),
  resultingFamilyId: input.resultingFamilyId,
  updatedAt: new Date(),
});
