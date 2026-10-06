import { Injectable } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { type ReviewDto, reviewRemarks } from "../common/dto/review.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Student, StudentApplication } from "../generated/prisma/client.js";
import { workflowNotification } from "../notifications/notification-texts.js";
import { NotificationsRepository } from "../notifications/notifications.repository.js";
import { StudentsRepository } from "../students/students.repository.js";
import { toStudentVo } from "../students/vo/students.vo.js";
import { StudentApplicationsRepository } from "./student-applications.repository.js";
import type { StudentApplicationReviewVo } from "./vo/student-application-review.vo.js";
import { toStudentApplicationVo } from "./vo/student-applications.vo.js";

// An admin's decision on a student registration application, in one
// transaction. Approving creates the ACTIVE student record, marks the
// application APPROVED and notifies the student, who is then invited to the
// portal (best effort, after the commit). Rejecting or asking for a correction
// records the remarks and notifies the applicant.
@Injectable()
export class StudentApplicationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: StudentApplicationsRepository,
    private readonly students: StudentsRepository,
    private readonly notifications: NotificationsRepository,
    private readonly auth: AuthService,
  ) {}

  async review(id: string, dto: ReviewDto): Promise<StudentApplicationReviewVo> {
    const remarks = reviewRemarks(dto, (message) => new ApiError(400, message));
    const lang = dto.lang ?? "en";
    const result = await this.prisma.$transaction(async (tx): Promise<{ application: StudentApplication; student: Student | null }> => {
      const application = await this.applications.findById(id, tx);
      if (!application) throw new ApiError(404, "Application not found.");
      if (application.status === "APPROVED") throw new ApiError(409, "This application has already been approved.");
      if (dto.decision !== "APPROVED") {
        const updated = await this.applications.update(id, { status: dto.decision, adminRemarks: remarks, reviewedDate: new Date() }, tx);
        const key = dto.decision === "REJECTED" ? "studentRejected" : "studentCorrection";
        await this.notifications.create(workflowNotification(key, application.applicationId, { remarks }, lang), tx);
        return { application: updated as StudentApplication, student: null };
      }
      const student = await createWithDisplayId(
        "NPSI-STU-",
        (prefix) => this.students.latestDisplayIds(prefix, tx),
        (studentId) =>
          this.students.create(
            {
              id: randomId(),
              studentId,
              studentName: application.studentName,
              fatherName: application.fatherName,
              status: "ACTIVE",
              mobile: application.mobile,
              email: application.email,
              dob: application.dob,
              gender: application.gender,
              course: application.course,
              institution: application.institution,
              academicYear: application.academicYear,
              guardianName: application.guardianName,
              guardianMobile: application.guardianMobile,
              address: application.address,
              city: application.city,
              district: application.district,
              state: application.state,
              pincode: application.pincode,
              photoUrl: application.photoUrl,
              registrationDate: new Date(),
              applicationId: application.applicationId,
            },
            tx,
          ),
      );
      const updated = await this.applications.update(
        id,
        { status: "APPROVED", adminRemarks: remarks ?? undefined, reviewedDate: new Date(), resultingStudentId: student.studentId },
        tx,
      );
      await this.notifications.create(workflowNotification("studentApproved", student.studentId as string, { studentId: student.studentId }, lang), tx);
      return { application: updated as StudentApplication, student };
    });
    const { application, student } = result;
    if (student && application.email) {
      await this.auth
        .invite({
          email: application.email,
          role: "user",
          fullName: application.studentName,
          phone: application.mobile || application.guardianMobile || undefined,
        })
        .catch((error: unknown) => console.error("[approval] invite failed:", error instanceof Error ? error.message : error));
    }
    return { application: toStudentApplicationVo(application), student: student ? toStudentVo(student) : null };
  }
}
