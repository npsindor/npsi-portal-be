import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { LANGS, type Lang } from "../../notifications/notification-texts.js";
import { OptionalText } from "../validation/fields.js";

export const DECISIONS = ["APPROVED", "REJECTED", "CORRECTION_REQUIRED"] as const;
export type Decision = (typeof DECISIONS)[number];

// An admin's decision on an application or request.
export class ReviewDto {
  @ApiProperty({ enum: DECISIONS })
  @IsIn(DECISIONS, { message: "Decision must be APPROVED, REJECTED or CORRECTION_REQUIRED." })
  decision!: Decision;

  @OptionalText(undefined, { description: "Required to reject or ask for a correction; shown to the applicant" })
  remarks?: string | null;

  @ApiPropertyOptional({ enum: LANGS, default: "en", description: "Language of the notification sent to the applicant" })
  @IsOptional()
  @IsIn(LANGS)
  lang?: Lang;
}

export const REMARKS_REQUIRED = "Remarks are required to reject or ask for a correction.";

// Remarks for the decision: trimmed, and required unless approving.
export const reviewRemarks = (dto: ReviewDto, error: (message: string) => Error): string | null => {
  const remarks = dto.remarks?.trim() || null;
  if (dto.decision !== "APPROVED" && !remarks) throw error(REMARKS_REQUIRED);
  return remarks;
};
