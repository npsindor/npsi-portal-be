import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalInt, RequiredText } from "../../common/validation/fields.js";

export const RULE_STATUSES = ["Active", "Archived"] as const;

export class CreateRuleDto {
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

  @OptionalChoice(RULE_STATUSES)
  status?: string | null;
}

export class UpdateRuleDto extends PartialType(CreateRuleDto) {}

export const RULE_ORDERS = orderValues(["id", "sectionNumber", "titleEn", "titleHi", "contentEn", "contentHi", "status", "createdAt", "updatedAt"] as const);

export class RuleListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: RULE_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(RULE_ORDERS)
  order?: (typeof RULE_ORDERS)[number];
}
