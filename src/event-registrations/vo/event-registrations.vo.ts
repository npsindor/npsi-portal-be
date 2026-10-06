import { ApiProperty } from "@nestjs/swagger";
import type { EventRegistration } from "../../generated/prisma/client.js";

export class EventRegistrationVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) registrationId!: string;
  @ApiProperty({ type: "string" }) eventId!: string;
  @ApiProperty({ type: "string", nullable: true }) eventTitle!: string | null;
  @ApiProperty({ type: "string", nullable: true }) familyId!: string | null;
  @ApiProperty({ nullable: true, oneOf: [{ type: "object" }, { type: "array", items: {} }] }) memberIds!: unknown;
  @ApiProperty({ nullable: true, oneOf: [{ type: "object" }, { type: "array", items: {} }] }) memberNames!: unknown;
  @ApiProperty({ type: "integer", nullable: true }) count!: number | null;
  @ApiProperty({ type: "number", nullable: true }) feePerMember!: number | null;
  @ApiProperty({ type: "number", nullable: true }) totalFee!: number | null;
  @ApiProperty({ type: "string", nullable: true }) paymentStatus!: string | null;
  @ApiProperty({ type: "string", nullable: true }) transactionId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", nullable: true }) registeredById!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) registeredDate!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) registrantName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) registrantEmail!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toEventRegistrationVo = (row: EventRegistration): EventRegistrationVo => ({
  id: row.id,
  registrationId: row.registrationId,
  eventId: row.eventId,
  eventTitle: row.eventTitle,
  familyId: row.familyId,
  memberIds: row.memberIds,
  memberNames: row.memberNames,
  count: row.count,
  feePerMember: row.feePerMember === null ? null : row.feePerMember.toNumber(),
  totalFee: row.totalFee === null ? null : row.totalFee.toNumber(),
  paymentStatus: row.paymentStatus,
  transactionId: row.transactionId,
  status: row.status,
  registeredById: row.registeredById,
  registeredDate: row.registeredDate,
  registrantName: row.registrantName,
  registrantEmail: row.registrantEmail,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
