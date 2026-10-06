import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalDate, OptionalText, RequiredText } from "../../common/validation/fields.js";

export class CreateFamilyMemberDto {
  @RequiredText("Family id is required.", 64)
  familyId!: string;

  @RequiredText("Name is required.")
  name!: string;

  @RequiredText("Relationship is required.", 255)
  relationship!: string;

  @OptionalText(255)
  gender?: string | null;

  @OptionalDate()
  dob?: string | null;

  @OptionalText(255)
  mobile?: string | null;

  @OptionalText(255)
  email?: string | null;

  @OptionalText(255)
  education?: string | null;

  @OptionalText(255)
  occupation?: string | null;

  @OptionalText()
  address?: string | null;

  @OptionalText()
  photoUrl?: string | null;

  @OptionalText(64)
  status?: string | null;

  @OptionalText(255)
  linkedStudentId?: string | null;
}

export class FamilyMemberBatchDto {
  @ApiProperty({ type: CreateFamilyMemberDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFamilyMemberDto)
  records?: CreateFamilyMemberDto[];
}

export class UpdateFamilyMemberDto extends PartialType(CreateFamilyMemberDto) {}

export const FAMILYMEMBER_ORDERS = orderValues([
  "id",
  "familyId",
  "membershipId",
  "name",
  "relationship",
  "gender",
  "dob",
  "mobile",
  "email",
  "education",
  "occupation",
  "address",
  "photoUrl",
  "status",
  "linkedStudentId",
  "createdAt",
  "updatedAt",
] as const);

export class FamilyMemberListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: FAMILYMEMBER_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(FAMILYMEMBER_ORDERS)
  order?: (typeof FAMILYMEMBER_ORDERS)[number];

  @ApiPropertyOptional({ description: "Exact match" })
  @IsOptional()
  @IsString()
  familyId?: string;
}
