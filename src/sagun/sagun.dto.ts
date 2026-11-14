import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { Equals, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
export class SagunSaveDto {
  @ApiProperty({ type: Object }) @IsObject() data!: Record<string, unknown>;
  @ApiProperty({ enum: ["DRAFT", "SUBMIT"] }) @IsIn(["DRAFT", "SUBMIT"]) action!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) ownerUserId?: string;
}
export class SagunReviewDto {
  @ApiProperty({ enum: ["APPROVED", "REJECTED", "DEACTIVATED"] }) @IsIn(["APPROVED", "REJECTED", "DEACTIVATED"]) status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1500) notes?: string;
}
export class SagunInquiryDto {
  @ApiProperty() @IsString() @MaxLength(1000) message!: string;
  @ApiProperty() @Equals(true) consent!: boolean;
}
export class SagunInquiryActionDto {
  @ApiProperty({ enum: ["ACCEPT", "DECLINE", "WITHDRAW", "REVOKE", "UPDATE_GRANT"] })
  @IsIn(["ACCEPT", "DECLINE", "WITHDRAW", "REVOKE", "UPDATE_GRANT"])
  action!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() shareSagun?: boolean;
}
export class SagunSearchDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(200) education?: string;
  @IsOptional() @IsString() @MaxLength(200) occupation?: string;
  @IsOptional() @IsString() @MaxLength(150) city?: string;
  @IsOptional() @IsString() @MaxLength(150) gotra?: string;
  @IsOptional() @IsIn(["GROOM", "BRIDE"]) candidateType?: string;
  @IsOptional() @IsIn(["NEVER_MARRIED", "DIVORCED", "WIDOW", "WIDOWER"]) maritalStatus?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(120) minAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(120) maxAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) offset?: number;
}
export class SagunConfigDto {
  @ApiProperty({ type: Object }) @IsObject() overrides!: Record<string, { en?: string; hi?: string; required?: boolean; enabled?: boolean }>;
}
