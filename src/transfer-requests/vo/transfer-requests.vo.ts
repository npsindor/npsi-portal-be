import { ApiProperty } from "@nestjs/swagger";
import type { TransferRequest } from "../../generated/prisma/client.js";

export class TransferRequestVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) requestId!: string;
  @ApiProperty({ type: "string" }) requestType!: string;
  @ApiProperty({ type: "string" }) status!: string;
  @ApiProperty({ type: "string", nullable: true }) reason!: string | null;
  @ApiProperty({ type: "string", nullable: true }) sourceStudentId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) sourceMembershipId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) sourceFamilyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) targetFamilyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) requesterId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) adminRemarks!: string | null;
  @ApiProperty({ type: "string", nullable: true }) approvedById!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) approvedDate!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) resultingMembershipId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) oldFamilyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) newFamilyId!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
  @ApiProperty({ type: "string", nullable: true }) requesterName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) requesterEmail!: string | null;
  @ApiProperty({ type: "string", nullable: true }) requesterMobile!: string | null;
  @ApiProperty({ type: "string", nullable: true }) targetFamilyName!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) requestedDate!: Date | null;
}

export const toTransferRequestVo = (row: TransferRequest): TransferRequestVo => ({
  id: row.id,
  requestId: row.requestId,
  requestType: row.requestType,
  status: row.status,
  reason: row.reason,
  sourceStudentId: row.sourceStudentId,
  sourceMembershipId: row.sourceMembershipId,
  sourceFamilyId: row.sourceFamilyId,
  targetFamilyId: row.targetFamilyId,
  requesterId: row.requesterId,
  adminRemarks: row.adminRemarks,
  approvedById: row.approvedById,
  approvedDate: row.approvedDate,
  resultingMembershipId: row.resultingMembershipId,
  oldFamilyId: row.oldFamilyId,
  newFamilyId: row.newFamilyId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  requesterName: row.requesterName,
  requesterEmail: row.requesterEmail,
  requesterMobile: row.requesterMobile,
  targetFamilyName: row.targetFamilyName,
  requestedDate: row.requestedDate,
});
