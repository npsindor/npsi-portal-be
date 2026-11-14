import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const text = (max = 255) => [IsString(), MaxLength(max)];

export class ExpenseCategoryDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class EventContributionDto {
  @IsOptional() @IsString() memberId?: string | null;
  @IsString() @MaxLength(255) memberName!: string;
  @IsOptional() @IsString() familyId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) village?: string | null;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string | null;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999) amount!: number;
  @IsIn(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"]) paymentMode!: string;
  @IsOptional() @IsString() @MaxLength(128) paymentReference?: string | null;
  @IsOptional() @IsIn(["PENDING", "APPROVED", "REJECTED"]) status?: string;
  @IsOptional() @IsDateString() contributedAt?: string;
}

export class EventExpenseDto {
  @IsString() categoryId!: string;
  @IsString() @MaxLength(255) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999) amount!: number;
  @IsOptional() @IsString() @MaxLength(255) vendorName?: string | null;
  @IsOptional() @IsString() @MaxLength(20) vendorMobile?: string | null;
  @IsOptional() @IsString() @MaxLength(128) invoiceNumber?: string | null;
  @IsDateString() expenseDate!: string;
  @IsIn(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"]) paymentMode!: string;
  @IsOptional() @IsString() @MaxLength(128) paymentReference?: string | null;
  @IsOptional() @IsString() @MaxLength(2048) receiptUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
  @IsIn(["PAID", "PENDING", "PARTIALLY_PAID"]) paymentStatus!: string;
  @IsOptional() @IsIn(["PENDING", "APPROVED", "REJECTED"]) status?: string;
}

export class EventTeamDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(255) leaderName?: string | null;
  @IsOptional() @IsString() @MaxLength(20) leaderMobile?: string | null;
  @IsOptional() @IsString() @MaxLength(3000) responsibilities?: string | null;
  @IsOptional() @IsIn(["ACTIVE", "INACTIVE"]) status?: string;
}

export class EventRosterDto {
  @IsOptional() @IsString() memberId?: string | null;
  @IsOptional() @IsString() teamId?: string | null;
  @IsString() @MaxLength(255) memberName!: string;
  @IsOptional() @IsString() @MaxLength(255) fatherName?: string | null;
  @IsOptional() @IsString() @MaxLength(255) village?: string | null;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string | null;
  @IsOptional() @IsString() @MaxLength(255) familyId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) membershipId?: string | null;
  @IsOptional() @IsString() @MaxLength(160) committee?: string | null;
  @IsOptional() @IsString() @MaxLength(255) responsibility?: string | null;
  @IsOptional() @IsIn(["ACTIVE", "INACTIVE"]) status?: string;
}

export class EventResponsibilityDto {
  @IsString() rosterId!: string;
  @IsOptional() @IsString() teamId?: string | null;
  @IsString() @MaxLength(255) title!: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string | null;
  @IsOptional() @IsDateString() startDate?: string | null;
  @IsOptional() @IsDateString() deadline?: string | null;
  @IsOptional() @IsIn(["LOW", "MEDIUM", "HIGH"]) priority?: string;
  @IsOptional() @IsIn(["ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) status?: string;
  @IsOptional() @IsString() @MaxLength(3000) remarks?: string | null;
}

export class RosterImportRowDto {
  @IsOptional() @IsString() memberId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) memberName?: string;
  @IsOptional() @IsString() @MaxLength(255) fatherName?: string;
  @IsOptional() @IsString() @MaxLength(255) village?: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
  @IsOptional() @IsString() @MaxLength(255) familyId?: string;
  @IsOptional() @IsString() @MaxLength(255) membershipId?: string;
  @IsOptional() @IsString() @MaxLength(160) committee?: string;
  @IsOptional() @IsString() @MaxLength(255) responsibility?: string;
}

export class RosterImportDto {
  @IsString() @MaxLength(255) fileName!: string;
  @IsBoolean() confirm!: boolean;
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => RosterImportRowDto) records!: RosterImportRowDto[];
}

export const DTO_TEXT_VALIDATION = text;
