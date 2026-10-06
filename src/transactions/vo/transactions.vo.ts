import { ApiProperty } from "@nestjs/swagger";
import type { Transaction } from "../../generated/prisma/client.js";

export class TransactionVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) transactionId!: string;
  @ApiProperty({ type: "string" }) type!: string;
  @ApiProperty({ type: "number" }) amount!: number;
  @ApiProperty({ type: "string", nullable: true }) paymentMethod!: string | null;
  @ApiProperty({ type: "string", nullable: true }) paymentStatus!: string | null;
  @ApiProperty({ type: "string", nullable: true }) familyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) memberId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) eventId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) referenceId!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) date!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) remarks!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toTransactionVo = (row: Transaction): TransactionVo => ({
  id: row.id,
  transactionId: row.transactionId,
  type: row.type,
  amount: row.amount.toNumber(),
  paymentMethod: row.paymentMethod,
  paymentStatus: row.paymentStatus,
  familyId: row.familyId,
  memberId: row.memberId,
  eventId: row.eventId,
  referenceId: row.referenceId,
  date: row.date,
  remarks: row.remarks,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
