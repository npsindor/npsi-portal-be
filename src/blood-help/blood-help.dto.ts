import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { RequiredChoice, RequiredText } from "../common/validation/fields.js";
import { LANGS, type Lang } from "../notifications/notification-texts.js";
import { BLOOD_GROUPS, MAX_UNITS, REQUEST_STATUSES } from "./blood-help.rules.js";

const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === "string" && !value.trim() ? undefined : typeof value === "string" ? value.trim() : value;

export class DonorDto {
  @RequiredChoice(BLOOD_GROUPS, "Blood group is required.")
  bloodGroup!: string;

  @ApiPropertyOptional({ example: "2024-04-15", description: "Last blood donation (YYYY-MM-DD); empty if never donated" })
  @Transform(blankToUndefined)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Last donation date must be YYYY-MM-DD." })
  lastDonationDate?: string;

  @ApiPropertyOptional({ default: true, description: "Suggest me and send me blood requests" })
  @IsOptional()
  @IsBoolean()
  available?: boolean;
}

export class BloodRequestDto {
  @RequiredText("Patient name is required.", 150)
  patientName!: string;

  @RequiredChoice(BLOOD_GROUPS, "Required blood group is required.")
  bloodGroup!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_UNITS })
  @Type(() => Number)
  @IsInt({ message: "Units required must be a whole number." })
  @Min(1, { message: "At least 1 unit is required." })
  @Max(MAX_UNITS, { message: `At most ${MAX_UNITS} units can be requested at once.` })
  units!: number;

  @RequiredText("Hospital name is required.", 200)
  hospital!: string;

  @RequiredText("City is required.", 150)
  city!: string;

  @RequiredText("Contact person name is required.", 150)
  contactName!: string;

  @RequiredText("Contact mobile number is required.", 20)
  contactPhone!: string;

  @ApiPropertyOptional({ enum: LANGS })
  @IsOptional()
  @IsIn(LANGS)
  lang?: Lang;
}

export const REQUEST_SORTS = [
  "createdAt",
  "-createdAt",
  "patientName",
  "-patientName",
  "bloodGroup",
  "-bloodGroup",
  "units",
  "-units",
  "status",
  "-status",
] as const;

export class RequestListDto {
  @ApiPropertyOptional({ enum: ["mine", "community"], default: "community" })
  @IsOptional()
  @IsIn(["mine", "community"])
  scope?: "mine" | "community";

  @ApiPropertyOptional({ enum: BLOOD_GROUPS }) @Transform(blankToUndefined) @IsOptional() @IsIn(BLOOD_GROUPS) bloodGroup?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150) city?: string;
  @ApiPropertyOptional({ enum: REQUEST_STATUSES }) @Transform(blankToUndefined) @IsOptional() @IsIn(REQUEST_STATUSES) status?: string;
  @ApiPropertyOptional({ description: "Patient or hospital name" }) @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: REQUEST_SORTS, default: "-createdAt" }) @IsOptional() @IsIn(REQUEST_SORTS) sort?: (typeof REQUEST_SORTS)[number];
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @Type(() => Number) @IsOptional() @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 }) @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50) pageSize?: number;
  @ApiPropertyOptional({ enum: LANGS, description: "Language of the WhatsApp message" }) @IsOptional() @IsIn(LANGS) lang?: Lang;
}

export class LangQueryDto {
  @ApiPropertyOptional({ enum: LANGS }) @IsOptional() @IsIn(LANGS) lang?: Lang;
}

export class NotifyDonorsDto {
  @ApiProperty({ type: [String], description: "Donor ids from this request's suggestions" })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  donorIds!: string[];

  @ApiPropertyOptional({ enum: LANGS }) @IsOptional() @IsIn(LANGS) lang?: Lang;
}

export class ConfirmationDto {
  @ApiProperty({ description: "true: the blood was received (request completed); false: still needed" })
  @IsBoolean({ message: "Say whether the blood was received." })
  received!: boolean;
}

export class AdminStatusDto {
  @RequiredChoice(REQUEST_STATUSES, "Choose In Progress or Completed.")
  status!: string;

  @ApiPropertyOptional({ description: "How it was verified (call / WhatsApp with the requester)" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
