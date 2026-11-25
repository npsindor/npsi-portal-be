import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalBoolean, OptionalChoice, OptionalDate, OptionalEmail, OptionalText } from "../../common/validation/fields.js";

export const FAMILY_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;

export class CreateFamilyDto {
  @OptionalText()
  familyName?: string | null;

  @OptionalText()
  headName?: string | null;

  @OptionalChoice(FAMILY_STATUSES)
  status?: string | null;

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

  @OptionalText(255)
  nativePlace?: string | null;

  @OptionalText(255)
  village?: string | null;

  @OptionalText(255)
  gotra?: string | null;

  @OptionalText(255)
  contactNumber?: string | null;

  @OptionalEmail()
  email?: string | null;

  @OptionalDate()
  registrationDate?: string | null;

  @OptionalText(255)
  applicationId?: string | null;

  @OptionalBoolean({ description: "Show the head's photo in the home page carousel and the family's birthday wishes" })
  showOnHome?: boolean | null;
}

export class UpdateFamilyDto extends PartialType(CreateFamilyDto) {}

// Admin → Families → "On website" for many families at once (the select-all box): one request, one update.
export const MAX_HOME_VISIBILITY_FAMILIES = 2000;
export class FamilyHomeVisibilityDto {
  @ApiProperty({ type: [String], description: "Record ids (`id`, not the NPSI-FAM display id) of the families to change" })
  // Plain class-validator decorators run bottom-up: the list check (last) comes first, then empty, then size, then each id.
  @MaxLength(64, { each: true, message: "familyIds must be a list of family ids." })
  @IsString({ each: true, message: "familyIds must be a list of family ids." })
  @ArrayMaxSize(MAX_HOME_VISIBILITY_FAMILIES, { message: `At most ${MAX_HOME_VISIBILITY_FAMILIES} families at a time.` })
  @ArrayNotEmpty({ message: "Choose at least one family." })
  @IsArray({ message: "familyIds must be a list of family ids." })
  familyIds!: string[];

  @ApiProperty({ description: "true shows the head's photo and birthday wishes on the home page, false hides them" })
  @IsBoolean({ message: "showOnHome must be true or false." })
  showOnHome!: boolean;
}

export const FAMILY_ORDERS = orderValues([
  "id",
  "familyId",
  "familyName",
  "headName",
  "status",
  "address",
  "city",
  "district",
  "state",
  "pincode",
  "nativePlace",
  "village",
  "gotra",
  "contactNumber",
  "email",
  "registrationDate",
  "memberCount",
  "applicationId",
  "createdAt",
  "updatedAt",
] as const);

export class FamilyListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: FAMILY_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(FAMILY_ORDERS, { message: "Invalid sort field." })
  order?: (typeof FAMILY_ORDERS)[number];

  @ApiPropertyOptional({ description: "Exact match" })
  @IsOptional()
  @IsString()
  familyId?: string;

  @ApiPropertyOptional({ description: "Exact match" })
  @IsOptional()
  @IsString()
  status?: string;
}
