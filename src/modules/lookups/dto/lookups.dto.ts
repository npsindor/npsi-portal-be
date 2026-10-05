import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional } from "class-validator";

// Missing values are answered with the legacy messages by the service, so
// the DTOs only document and whitelist the accepted parameters.

export class FamilyIdParamDto {
  @ApiProperty({ example: "NPSI-FAM-000123" }) @IsOptional() familyId: string;
}

export class ApplicationStatusQueryDto {
  @ApiPropertyOptional({ example: "NPSI-APP-2026-000001" }) @IsOptional() applicationId?: string;
  @ApiPropertyOptional({ example: "9876543210", description: "Mobile number given on the application" }) @IsOptional() mobile?: string;
}

export class MobileQueryDto {
  @ApiPropertyOptional({ example: "9876543210", description: "Any format; the last 10 digits are compared" }) @IsOptional() mobile?: string;
}

export class EmailQueryDto {
  @ApiPropertyOptional({ example: "member@example.com", description: "Compared case-insensitively" }) @IsOptional() email?: string;
}
