import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalDate, OptionalText, RequiredText } from "../../common/validation/fields.js";

export class CreateStudentDto {
  @RequiredText("Student name is required.")
  studentName!: string;

  @OptionalText(64)
  status?: string | null;

  @OptionalText(255)
  mobile?: string | null;

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
  registrationDate?: string | null;

  @OptionalText(255)
  applicationId?: string | null;

  @OptionalText(255)
  linkedFamilyId?: string | null;

  @OptionalText(255)
  linkedMembershipId?: string | null;

  @OptionalText(255)
  fatherName?: string | null;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export const STUDENT_ORDERS = orderValues([
  "id",
  "studentId",
  "studentName",
  "status",
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
  "registrationDate",
  "applicationId",
  "linkedFamilyId",
  "linkedMembershipId",
  "createdAt",
  "updatedAt",
  "fatherName",
] as const);

export class StudentListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: STUDENT_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(STUDENT_ORDERS)
  order?: (typeof STUDENT_ORDERS)[number];
}
