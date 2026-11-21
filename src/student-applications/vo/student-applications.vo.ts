import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { toDateOnly } from "../../common/utils/dates.js";
import type { StudentApplication, Transaction } from "../../generated/prisma/client.js";

// The application's registration fee, for the admin review (null: none recorded, e.g. older free registrations).
export class StudentApplicationPaymentVo {
  @ApiProperty({ type: "string", description: "Transaction id (POST /registration-payments/:id/review)" }) id!: string;
  @ApiProperty({ type: "string" }) transactionId!: string;
  @ApiProperty({ type: "number" }) amount!: number;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", nullable: true }) utr!: string | null;
  @ApiProperty({ type: "boolean" }) hasScreenshot!: boolean;
  @ApiProperty({ type: "string", nullable: true }) adminRemarks!: string | null;
}

export const toStudentPaymentVo = (fee: Transaction | undefined | null): StudentApplicationPaymentVo | null =>
  fee
    ? {
        id: fee.id,
        transactionId: fee.transactionId,
        amount: fee.amount.toNumber(),
        status: fee.paymentStatus,
        utr: fee.utr,
        hasScreenshot: Boolean(fee.screenshotFile),
        adminRemarks: fee.adminRemarks,
      }
    : null;

export class StudentApplicationVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) applicationId!: string;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string" }) studentName!: string;
  @ApiProperty({ type: "string" }) mobile!: string;
  @ApiProperty({ type: "string", nullable: true }) email!: string | null;
  @ApiProperty({ type: "string", format: "date", nullable: true }) dob!: string | null;
  @ApiProperty({ type: "string", nullable: true }) gender!: string | null;
  @ApiProperty({ type: "string", nullable: true }) course!: string | null;
  @ApiProperty({ type: "string", nullable: true }) institution!: string | null;
  @ApiProperty({ type: "string", nullable: true }) academicYear!: string | null;
  @ApiProperty({ type: "string", nullable: true }) guardianName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) guardianMobile!: string | null;
  @ApiProperty({ type: "string", nullable: true }) address!: string | null;
  @ApiProperty({ type: "string", nullable: true }) city!: string | null;
  @ApiProperty({ type: "string", nullable: true }) district!: string | null;
  @ApiProperty({ type: "string", nullable: true }) state!: string | null;
  @ApiProperty({ type: "string", nullable: true }) pincode!: string | null;
  @ApiProperty({ type: "string", nullable: true }) photoUrl!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) submittedDate!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) adminRemarks!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) reviewedDate!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) resultingStudentId!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
  @ApiProperty({ type: "string", nullable: true }) fatherName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) motherName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) educationLevel!: string | null;
  @ApiProperty({ type: "string", nullable: true }) linkedFamilyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) linkedMembershipId!: string | null;
  @ApiPropertyOptional({ type: StudentApplicationPaymentVo, nullable: true, description: "Registration fee (admin list only)" })
  payment?: StudentApplicationPaymentVo | null;
}

export const toStudentApplicationVo = (row: StudentApplication): StudentApplicationVo => ({
  id: row.id,
  applicationId: row.applicationId,
  status: row.status,
  studentName: row.studentName,
  mobile: row.mobile,
  email: row.email,
  dob: toDateOnly(row.dob),
  gender: row.gender,
  course: row.course,
  institution: row.institution,
  academicYear: row.academicYear,
  guardianName: row.guardianName,
  guardianMobile: row.guardianMobile,
  address: row.address,
  city: row.city,
  district: row.district,
  state: row.state,
  pincode: row.pincode,
  photoUrl: row.photoUrl,
  submittedDate: row.submittedDate,
  adminRemarks: row.adminRemarks,
  reviewedDate: row.reviewedDate,
  resultingStudentId: row.resultingStudentId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  fatherName: row.fatherName,
  motherName: row.motherName,
  educationLevel: row.educationLevel,
  linkedFamilyId: row.linkedFamilyId,
  linkedMembershipId: row.linkedMembershipId,
});
