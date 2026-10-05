import { ApiProperty } from "@nestjs/swagger";

// The deliberately small set of family fields shown on a public membership-card check.
export class PublicFamilyVo {
  @ApiProperty({ example: "NPSI-FAM-000123" }) family_id: string;
  @ApiProperty({ nullable: true }) family_name: string | null;
  @ApiProperty({ nullable: true }) head_name: string | null;
  @ApiProperty({ example: "ACTIVE" }) status: string;
  @ApiProperty({ nullable: true }) city: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) registration_date: Date | string | null;
}

export class PublicMemberVo {
  @ApiProperty() name: string;
  @ApiProperty() relationship: string;
  @ApiProperty({ nullable: true }) gender: string | null;
  @ApiProperty({ example: "ACTIVE" }) status: string;
}

export class FamilyVerificationVo {
  @ApiProperty({ type: PublicFamilyVo }) family: PublicFamilyVo;
  @ApiProperty({ type: PublicMemberVo, isArray: true }) members: PublicMemberVo[];
}

export class AvailabilityVo {
  @ApiProperty({ example: false, description: "true when the value is already registered" }) taken: boolean;
}

export class StatsVo {
  @ApiProperty({ example: 120, description: "Active families" }) families: number;
  @ApiProperty({ example: 480, description: "Active family members" }) members: number;
}
