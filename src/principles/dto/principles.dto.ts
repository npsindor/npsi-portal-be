import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalInt, OptionalText, RequiredText } from "../../common/validation/fields.js";

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

  @OptionalText(64, { notNull: true })
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
