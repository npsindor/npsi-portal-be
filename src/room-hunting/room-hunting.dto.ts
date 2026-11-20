import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { LISTING_STATUSES, MAX_LISTING_PHOTOS, MAX_RENT, REQUIREMENT_STATUSES, TENANT_TYPES } from "./room-hunting.rules.js";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === "string" && !value.trim() ? undefined : typeof value === "string" ? value.trim() : value;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Only images stored by this API's own upload endpoint may be attached.
const UPLOAD_URL = /^(https?:\/\/[^\s"'<>]+)?\/(api\/v1\/)?uploads\/[A-Za-z0-9_-]+\.(jpg|png|webp|gif)$/;

export class ListingDto {
  @ApiProperty({ description: "Idempotency key (UUID) so a double click creates one listing" }) @IsUUID() clientRequestId!: string;
  @ApiProperty({ example: "1 BHK" }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(60) propertyType!: string;
  @ApiPropertyOptional({ enum: TENANT_TYPES }) @IsOptional() @IsIn(TENANT_TYPES) availableFor?: string;
  @ApiProperty({ minimum: 0, maximum: MAX_RENT }) @IsInt() @Min(0) @Max(MAX_RENT) rentAmount!: number;
  @ApiProperty({ example: "Vijay Nagar" }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) area!: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showAddress?: boolean;
  @ApiPropertyOptional({ example: "2026-12-01" }) @Transform(blankToUndefined) @IsOptional() @Matches(DATE) availableFrom?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ description: "URL returned by POST /uploads" })
  @Transform(blankToUndefined)
  @IsOptional()
  @Matches(UPLOAD_URL, { message: "Upload the photograph first." })
  photoUrl?: string;
  @ApiPropertyOptional({ type: [String], maxItems: MAX_LISTING_PHOTOS, description: "Several URLs returned by POST /uploads; the first is the cover photo" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LISTING_PHOTOS, { message: `At most ${MAX_LISTING_PHOTOS} photographs.` })
  @Matches(UPLOAD_URL, { each: true, message: "Upload the photograph first." })
  photoUrls?: string[];
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) contactName!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(20) contactMobile!: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsEmail() @MaxLength(254) contactEmail?: string;
  @ApiProperty() @IsBoolean() showMobile!: boolean;
  @ApiProperty() @IsBoolean() showEmail!: boolean;
  @ApiProperty({ description: "The poster owns the property or has the owner's permission to list it" })
  @Equals(true, { message: "Confirm that you may list this property." })
  ownerConfirmed!: boolean;
}

export class ListingStatusDto {
  @ApiProperty({ enum: ["RENTED", "INACTIVE", "ACTIVE"], description: "ACTIVE re-lists a rented/inactive listing (it is reviewed again)" })
  @IsIn(["RENTED", "INACTIVE", "ACTIVE"])
  status!: string;
}

export class RequirementDto {
  @ApiProperty() @IsUUID() clientRequestId!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(20) mobile!: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(60) propertyType!: string;
  @ApiPropertyOptional({ enum: TENANT_TYPES }) @IsOptional() @IsIn(TENANT_TYPES) tenantType?: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) area!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MAX_RENT) minBudget?: number;
  @ApiProperty() @IsInt() @Min(500) @Max(MAX_RENT) maxBudget!: number;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @Matches(DATE) moveInDate?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @ApiProperty() @IsBoolean() showMobile!: boolean;
  @ApiProperty() @IsBoolean() showEmail!: boolean;
  @ApiProperty({ description: "Consent to store the requirement and share it with matching property owners" })
  @Equals(true, { message: "Please accept the consent." })
  consent!: boolean;
  @ApiPropertyOptional({ description: "reCAPTCHA token; required when not logged in" }) @IsOptional() @IsString() @MaxLength(4000) recaptchaToken?: string;
  @ApiPropertyOptional({ enum: ["en", "hi"] }) @IsOptional() @IsIn(["en", "hi"]) lang?: string;
}

export class EnquiryDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) message!: string;
  @ApiPropertyOptional({ description: "One of your own requirements this enquiry is about" }) @IsOptional() @IsString() @MaxLength(64) requirementId?: string;
  @ApiProperty({ description: "Consent to share your name and mobile number with the owner" })
  @Equals(true, { message: "Please accept the consent." })
  consent!: boolean;
}

export class PublicSearchDto {
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(60) type?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150) area?: string;
  @ApiPropertyOptional()
  @Transform(({ value }) => (value === "" || value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RENT)
  maxRent?: number;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @Transform(({ value }) => (value === undefined ? 1 : Number(value))) @IsOptional() @IsInt() @Min(1) @Max(1000) page?: number;
}

export class AdminListDto {
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsIn([...new Set([...LISTING_STATUSES, ...REQUIREMENT_STATUSES])]) status?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class ReviewDto {
  @ApiProperty({ enum: ["APPROVE", "REJECT", "DEACTIVATE", "EXPIRE", "ARCHIVE", "RESTORE"] })
  @IsIn(["APPROVE", "REJECT", "DEACTIVATE", "EXPIRE", "ARCHIVE", "RESTORE"])
  decision!: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}
