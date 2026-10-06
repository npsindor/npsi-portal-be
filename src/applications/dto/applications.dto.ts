import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalDate, OptionalJson, OptionalText } from "../../common/validation/fields.js";
import { LANGS, type Lang } from "../../notifications/notification-texts.js";

export class CreateApplicationDto {
  @OptionalText(64)
  status?: string | null;

  @OptionalText(undefined, { notNull: true })
  familyHeadName?: string;

  @OptionalText(255)
  mobile?: string | null;

  @OptionalText(255)
  email?: string | null;

  @OptionalText(undefined, { notNull: true })
  familyName?: string;

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
  gotra?: string | null;

  @OptionalText(255)
  nativePlace?: string | null;

  @OptionalText(255)
  village?: string | null;

  @OptionalJson()
  membersData?: unknown | null;

  @OptionalDate()
  submittedDate?: string | null;

  @OptionalText()
  adminRemarks?: string | null;

  @OptionalDate()
  reviewedDate?: string | null;

  @OptionalText(255)
  resultingFamilyId?: string | null;

  @ApiPropertyOptional({ description: "Google reCAPTCHA v3 token (required when the server has a secret configured)" })
  @IsOptional()
  @IsString()
  recaptchaToken?: string;

  @ApiPropertyOptional({ enum: LANGS, default: "en", description: "Language of the confirmation notification" })
  @IsOptional()
  @IsIn(LANGS)
  lang?: Lang;
}

export class UpdateApplicationDto extends PartialType(CreateApplicationDto) {}

export const APPLICATION_ORDERS = orderValues([
  "id",
  "applicationId",
  "status",
  "familyHeadName",
  "mobile",
  "email",
  "familyName",
  "address",
  "city",
  "district",
  "state",
  "pincode",
  "gotra",
  "nativePlace",
  "village",
  "submittedDate",
  "adminRemarks",
  "reviewedDate",
  "resultingFamilyId",
  "createdAt",
  "updatedAt",
] as const);

export class ApplicationListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: APPLICATION_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(APPLICATION_ORDERS)
  order?: (typeof APPLICATION_ORDERS)[number];
}
