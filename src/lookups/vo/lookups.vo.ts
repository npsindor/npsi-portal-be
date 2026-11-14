import { ApiProperty } from "@nestjs/swagger";

// The deliberately small set of family fields shown on a public membership-card check.
// Public (no login) membership-pass check: only what confirms the pass is genuine. No member names,
// contact details or address — family ids are sequential, so anything here can be collected for every family.
export class PublicFamilyVo {
  @ApiProperty({ type: "string", nullable: true, example: "NPSI-FAM-000123" }) familyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) familyName!: string | null;
  @ApiProperty({ type: "string", nullable: true, example: "R*** P***", description: "Head of family, masked" }) headName!: string | null;
  @ApiProperty({ type: "string", nullable: true, example: "ACTIVE" }) status!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) registrationDate!: Date | null;
  @ApiProperty({ example: 4 }) memberCount!: number;
}

export class FamilyVerificationVo {
  @ApiProperty({ type: PublicFamilyVo }) family!: PublicFamilyVo;
}

// Public application tracking (application id + mobile): the decision only, never the stored form
// (mobile, email, address, members' details).
export class ApplicationStatusVo {
  @ApiProperty({ example: "NPSI-APP-2026-000001" }) applicationId!: string;
  @ApiProperty({ type: "string", nullable: true }) familyHeadName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) familyName!: string | null;
  @ApiProperty({ type: "string", nullable: true, example: "PENDING_VERIFICATION" }) status!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) submittedDate!: Date | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) reviewedDate!: Date | null;
  @ApiProperty({ type: "string", nullable: true, description: "Family / student id once approved" }) resultingFamilyId!: string | null;
  @ApiProperty({ type: "string", nullable: true, description: "Admin's note (correction or rejection reason)" }) adminRemarks!: string | null;
}

export class AvailabilityVo {
  @ApiProperty({ example: false, description: "true when the value is already registered" }) taken!: boolean;
}

export class StatsVo {
  @ApiProperty({ example: 120, description: "Active families" }) families!: number;
  @ApiProperty({ example: 480, description: "Active family members" }) members!: number;
}
