import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalInt, RequiredText } from "../../common/validation/fields.js";

export const PRINCIPLE_STATUSES = ["Active", "Archived"] as const;

export class CreatePrincipleDto {
  @OptionalInt()
  sectionNumber?: number | null;

  @RequiredText("Title en is required.")
  titleEn!: string;

  @RequiredText("Title hi is required.")
  titleHi!: string;

  @RequiredText("Content en is required.")
  contentEn!: string;

  @RequiredText("Content hi is required.")
  contentHi!: string;

  @OptionalChoice(PRINCIPLE_STATUSES, { notNull: true })
  status?: string;
}

export class UpdatePrincipleDto extends PartialType(CreatePrincipleDto) {}

export const PRINCIPLE_ORDERS = orderValues([
  "id",
  "sectionNumber",
  "titleEn",
  "titleHi",
  "contentEn",
  "contentHi",
  "status",
  "createdAt",
  "updatedAt",
] as const);

export class PrincipleListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: PRINCIPLE_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(PRINCIPLE_ORDERS)
  order?: (typeof PRINCIPLE_ORDERS)[number];
}
