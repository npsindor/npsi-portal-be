import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { Equals, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { REVIEW_STATUSES, SAGUN_STATUSES } from "./sagun.eligibility.js";
export class SagunSaveDto {
  @ApiProperty({ type: Object }) @IsObject() data!: Record<string, unknown>;
  @ApiProperty({ enum: ["DRAFT", "SUBMIT"] }) @IsIn(["DRAFT", "SUBMIT"]) action!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) ownerUserId?: string;
  @ApiPropertyOptional({ description: "Family member (family_members.id) this profile is for; verified against the caller's family on the server" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  memberId?: string;
  @ApiPropertyOptional({ enum: ["BRIDE", "GROOM"], description: "Registration route category; cross-checked against the verified family member" })
  @IsOptional()
  @IsIn(["BRIDE", "GROOM"])
  category?: string;
}
export class SagunReviewDto {
  @ApiProperty({ enum: REVIEW_STATUSES }) @IsIn(REVIEW_STATUSES) status!: string;
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
export class SagunAdminListDto {
  @ApiPropertyOptional({ description: "Name, Family ID, Membership ID or Student ID" }) @IsOptional() @IsString() @MaxLength(150) search?: string;
  @ApiPropertyOptional({ enum: ["GROOM", "BRIDE"] }) @IsOptional() @IsIn(["GROOM", "BRIDE"]) candidateType?: string;
  @ApiPropertyOptional({ enum: SAGUN_STATUSES }) @IsOptional() @IsIn(SAGUN_STATUSES) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) village?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) education?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) occupation?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(120) minAge?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(120) maxAge?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 500 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) offset?: number;
}
export class SagunAdminEditDto {
  @ApiProperty({ type: Object, description: "Only the fields being corrected" }) @IsObject() data!: Record<string, unknown>;
  @ApiProperty({ description: "Why the record was corrected (kept in the application log)" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(1500)
  remarks!: string;
}
export class SagunSettingsDto {
  @ApiProperty({ minimum: 18, maximum: 60 }) @IsInt() @Min(18) @Max(60) minimumFemaleAge!: number;
  @ApiProperty({ minimum: 21, maximum: 60 }) @IsInt() @Min(21) @Max(60) minimumMaleAge!: number;
  @ApiProperty() @IsBoolean() registrationEnabled!: boolean;
  @ApiProperty({ enum: ["MEMBERS", "HIDDEN"] }) @IsIn(["MEMBERS", "HIDDEN"]) profileVisibility!: string;
  @ApiProperty() @IsBoolean() approvalRequired!: boolean;
  @ApiProperty() @IsBoolean() allowEditAfterSubmission!: boolean;
  @ApiProperty() @IsBoolean() allowResubmission!: boolean;
}
