import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNumber, IsOptional, Matches, Min } from "class-validator";
import { ListQueryDto } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalText, RequiredChoice, RequiredText } from "../../common/validation/fields.js";
import { MARITAL_STATUSES } from "../../family-members/dto/family-members.dto.js";
import { LANGS, type Lang } from "../../notifications/notification-texts.js";
import { CITIES, GENDERS, PAYMENT_DECISIONS, REGISTRATION_TYPES } from "../registration.rules.js";

// The short account-first registration form (name, gender, birth date, current and native address)
// plus the uploaded UPI payment proof.
export class RegistrationDto {
  @RequiredChoice(REGISTRATION_TYPES, "Registration type is required.")
  type!: string;

  @RequiredText("First name is required.", 100)
  firstName!: string;

  @RequiredText("Last name is required.", 100)
  lastName!: string;

  @RequiredChoice(GENDERS, "Gender is required.")
  gender!: string;

  @RequiredText("Date of birth is required.", 10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Date of birth must be YYYY-MM-DD." })
  dob!: string;

  @OptionalChoice(MARITAL_STATUSES, { description: "Family registration: the head's marital status (asked by the form)" })
  maritalStatus?: string | null;

  @OptionalText(150, { description: 'Student registration: class or course, e.g. "12th" or "B.Tech (Computer Science)"' })
  education?: string | null;

  @RequiredChoice(CITIES, "City is required.")
  city!: string;

  @RequiredText("Area is required.", 150)
  area!: string;

  @RequiredText("Address is required.", 500)
  address!: string;

  @RequiredText("PIN code is required.", 6)
  @Matches(/^[1-9]\d{5}$/, { message: "A valid 6-digit PIN code is required." })
  pincode!: string;

  @RequiredText("Native village is required.", 150)
  nativeVillage!: string;

  @OptionalText(120, { description: "File id returned by POST /me/payment-screenshots (required for a new registration)" })
  screenshotFileId?: string | null;

  @OptionalText(40, { description: "UPI transaction reference (UTR), if the payer has it" })
  utr?: string | null;

  @ApiPropertyOptional({ enum: LANGS, default: "en", description: "Language for notifications to the applicant" })
  @IsOptional()
  @IsIn(LANGS)
  lang?: Lang;
}

export class PaymentReviewDto {
  @RequiredChoice(PAYMENT_DECISIONS, "Choose a valid payment or refund decision.")
  decision!: string;

  @OptionalText(1000, { description: "Required for rejection or refund decisions; sent to the applicant" })
  remarks?: string | null;

  @OptionalText(120, { description: "Required when confirming a completed refund" })
  refundReference?: string | null;

  @ApiPropertyOptional({ type: "number", minimum: 0.01, description: "Refund amount; required when confirming a completed refund" })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  refundAmount?: number;

  @ApiPropertyOptional({ enum: LANGS, default: "en" })
  @IsOptional()
  @IsIn(LANGS)
  lang?: Lang;
}

export class RegistrationPaymentsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ["PENDING", "SUBMITTED", "VERIFIED", "REJECTED", "REFUND_REQUESTED", "REFUND_PROCESSING", "REFUNDED", "REFUND_REJECTED"] })
  @IsOptional()
  @IsIn(["PENDING", "SUBMITTED", "VERIFIED", "REJECTED", "REFUND_REQUESTED", "REFUND_PROCESSING", "REFUNDED", "REFUND_REJECTED"])
  status?: string;
}
