import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalBirthDate, OptionalChoice, OptionalDate, OptionalText } from "../../common/validation/fields.js";
import { LANGS, type Lang } from "../../notifications/notification-texts.js";

export const STUDENT_APPLICATION_STATUSES = ["DRAFT", "SUBMITTED", "PENDING_VERIFICATION", "CORRECTION_REQUIRED", "APPROVED", "REJECTED"] as const;

export class CreateStudentApplicationDto {
  @OptionalChoice(STUDENT_APPLICATION_STATUSES)
  status?: string | null;

  @OptionalText(undefined, { notNull: true })
  studentName?: string;

  @OptionalText(255, { notNull: true })
  mobile?: string;

  @OptionalText(255)
  email?: string | null;

  @OptionalBirthDate()
  dob?: string | null;

  @OptionalText(255)
  gender?: string | null;

  @OptionalText(255)
  course?: string | null;

  @OptionalText(255)
  institution?: string | null;

  @OptionalText(255)
  academicYear?: string | null;

  @OptionalText(255)
  guardianName?: string | null;

  @OptionalText(255)
  guardianMobile?: string | null;

  @OptionalText()
  address?: string | null;

  @OptionalText(255)
  city?: string | null;

  @OptionalText(255)
  district?: string | null;

  @OptionalText(255)
  state?: string | null;

  @OptionalText(255)
  pincode?: string | null;

  @OptionalText()
  photoUrl?: string | null;

  @OptionalDate()
  submittedDate?: string | null;

  @OptionalText()
  adminRemarks?: string | null;

  @OptionalDate()
  reviewedDate?: string | null;

  @OptionalText(255)
  resultingStudentId?: string | null;

  @OptionalText(255)
  fatherName?: string | null;

  @OptionalText(255)
  motherName?: string | null;

  @OptionalText(255)
  educationLevel?: string | null;

  // A FamilyMember row id, never a client-supplied Family ID. The service
  // verifies it belongs to the authenticated user's active family.
  @OptionalText(64)
  memberId?: string | null;

  @ApiPropertyOptional({ description: "Google reCAPTCHA v3 token (required when the server has a secret configured)" })
  @IsOptional()
  @IsString()
  recaptchaToken?: string;

  @ApiPropertyOptional({ enum: LANGS, default: "en", description: "Language of the confirmation notification" })
  @IsOptional()
  @IsIn(LANGS)
  lang?: Lang;
}

export class UpdateStudentApplicationDto extends PartialType(CreateStudentApplicationDto) {}

export const STUDENTAPPLICATION_ORDERS = orderValues([
  "id",
  "applicationId",
  "status",
  "studentName",
  "mobile",
  "email",
  "dob",
  "gender",
  "course",
  "institution",
  "academicYear",
  "guardianName",
  "guardianMobile",
  "address",
  "city",
  "district",
  "state",
  "pincode",
  "photoUrl",
  "submittedDate",
  "adminRemarks",
  "reviewedDate",
  "resultingStudentId",
  "createdAt",
  "updatedAt",
  "fatherName",
  "motherName",
  "educationLevel",
  "linkedFamilyId",
  "linkedMembershipId",
] as const);

export class StudentApplicationListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: STUDENTAPPLICATION_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(STUDENTAPPLICATION_ORDERS)
  order?: (typeof STUDENTAPPLICATION_ORDERS)[number];
}
