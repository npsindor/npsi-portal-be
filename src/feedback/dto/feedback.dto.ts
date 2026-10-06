import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalBoolean, OptionalDate, OptionalInt, OptionalJson, OptionalText, RequiredText } from "../../common/validation/fields.js";

export class CreateFeedbackDto {
  @RequiredText("Member name is required.")
  memberName!: string;

  @OptionalText(255)
  familyId?: string | null;

  @OptionalText(255)
  email?: string | null;

  @OptionalText(255)
  feedbackType?: string | null;

  @OptionalText(255)
  subject?: string | null;

  @OptionalText()
  message?: string | null;

  @OptionalText()
  attachmentUrl?: string | null;

  @OptionalJson()
  questions?: unknown | null;

  @OptionalInt()
  rating?: number | null;

  @OptionalText(64)
  status?: string | null;

  @OptionalText()
  reply?: string | null;

  @OptionalDate()
  repliedDate?: string | null;

  @OptionalText(255)
  repliedById?: string | null;

  @OptionalText()
  internalNote?: string | null;

  @OptionalBoolean({ notNull: true })
  archived?: boolean;

  @OptionalDate()
  submittedDate?: string | null;
}

export class UpdateFeedbackDto extends PartialType(CreateFeedbackDto) {}

export const FEEDBACK_ORDERS = orderValues([
  "id",
  "feedbackId",
  "memberName",
  "familyId",
  "email",
  "feedbackType",
  "subject",
  "message",
  "attachmentUrl",
  "rating",
  "status",
  "reply",
  "repliedDate",
  "repliedById",
  "internalNote",
  "archived",
  "submittedDate",
  "createdAt",
  "updatedAt",
] as const);

export class FeedbackListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: FEEDBACK_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(FEEDBACK_ORDERS)
  order?: (typeof FEEDBACK_ORDERS)[number];
}
