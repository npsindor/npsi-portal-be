import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalBoolean, OptionalChoice, OptionalDate, OptionalInt, OptionalJson, OptionalText, RequiredText } from "../../common/validation/fields.js";

export const FEEDBACK_STATUSES = ["Submitted", "In Review", "Resolved", "Closed"] as const;
export const FEEDBACK_TYPES = ["General", "Suggestion", "Complaint", "Appreciation", "Bug", "Other"] as const;

export class CreateFeedbackDto {
  @RequiredText("Member name is required.")
  memberName!: string;

  @OptionalText(255)
  familyId?: string | null;

  @OptionalText(255)
  email?: string | null;

  @OptionalChoice(FEEDBACK_TYPES)
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

  @OptionalChoice(FEEDBACK_STATUSES)
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
