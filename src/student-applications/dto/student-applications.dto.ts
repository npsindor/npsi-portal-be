import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalDate, OptionalText } from "../../common/validation/fields.js";

export class CreateStudentApplicationDto {
  @OptionalText(64)
  status?: string | null;

  @OptionalText(undefined, { notNull: true })
  studentName?: string;

  @OptionalText(255, { notNull: true })
  mobile?: string;

  @OptionalText(255)
  email?: string | null;

  @OptionalDate()
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

  @ApiPropertyOptional({ description: "Google reCAPTCHA v3 token (required when the server has a secret configured)" })
  @IsOptional()
  @IsString()
  recaptchaToken?: string;
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
] as const);

export class StudentApplicationListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: STUDENTAPPLICATION_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(STUDENTAPPLICATION_ORDERS)
  order?: (typeof STUDENTAPPLICATION_ORDERS)[number];
}
