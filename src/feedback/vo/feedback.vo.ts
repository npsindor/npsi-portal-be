import { ApiProperty } from "@nestjs/swagger";
import type { Feedback } from "../../generated/prisma/client.js";

export class FeedbackVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string", nullable: true }) feedbackId!: string | null;
  @ApiProperty({ type: "string" }) memberName!: string;
  @ApiProperty({ type: "string", nullable: true }) familyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) email!: string | null;
  @ApiProperty({ type: "string", nullable: true }) feedbackType!: string | null;
  @ApiProperty({ type: "string", nullable: true }) subject!: string | null;
  @ApiProperty({ type: "string", nullable: true }) message!: string | null;
  @ApiProperty({ type: "string", nullable: true }) attachmentUrl!: string | null;
  @ApiProperty({ nullable: true, oneOf: [{ type: "object" }, { type: "array", items: {} }] }) questions!: unknown;
  @ApiProperty({ type: "integer", nullable: true }) rating!: number | null;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", nullable: true }) reply!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) repliedDate!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) repliedById!: string | null;
  @ApiProperty({ type: "string", nullable: true }) internalNote!: string | null;
  @ApiProperty({ type: "boolean" }) archived!: boolean;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) submittedDate!: Date | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toFeedbackVo = (row: Feedback): FeedbackVo => ({
  id: row.id,
  feedbackId: row.feedbackId,
  memberName: row.memberName,
  familyId: row.familyId,
  email: row.email,
  feedbackType: row.feedbackType,
  subject: row.subject,
  message: row.message,
  attachmentUrl: row.attachmentUrl,
  questions: row.questions,
  rating: row.rating,
  status: row.status,
  reply: row.reply,
  repliedDate: row.repliedDate,
  repliedById: row.repliedById,
  internalNote: row.internalNote,
  archived: row.archived,
  submittedDate: row.submittedDate,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
