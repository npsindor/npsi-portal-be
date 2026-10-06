import { ApiProperty } from "@nestjs/swagger";

// The deliberately small set of family fields shown on a public membership-card check.
export class PublicFamilyVo {
  @ApiProperty({ type: "string", nullable: true, example: "NPSI-FAM-000123" }) familyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) familyName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) headName!: string | null;
  @ApiProperty({ type: "string", nullable: true, example: "ACTIVE" }) status!: string | null;
  @ApiProperty({ type: "string", nullable: true }) city!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) registrationDate!: Date | null;
}

export class PublicMemberVo {
  @ApiProperty() name!: string;
  @ApiProperty() relationship!: string;
  @ApiProperty({ type: "string", nullable: true }) gender!: string | null;
  @ApiProperty({ type: "string", nullable: true, example: "ACTIVE" }) status!: string | null;
}

export class FamilyVerificationVo {
  @ApiProperty({ type: PublicFamilyVo }) family!: PublicFamilyVo;
  @ApiProperty({ type: PublicMemberVo, isArray: true }) members!: PublicMemberVo[];
}

export class AvailabilityVo {
  @ApiProperty({ example: false, description: "true when the value is already registered" }) taken!: boolean;
}

export class StatsVo {
  @ApiProperty({ example: 120, description: "Active families" }) families!: number;
  @ApiProperty({ example: 480, description: "Active family members" }) members!: number;
}
