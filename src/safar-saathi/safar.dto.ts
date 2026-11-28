import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Equals, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { OptionalText, RequiredChoice, RequiredText } from "../common/validation/fields.js";

export class CreateSafarDto {
  @ApiProperty() @IsUUID() clientRequestId!: string;
  @RequiredChoice(["REQUEST", "OFFER"], "Choose request or offer.") kind!: string;
  @RequiredChoice(["TRAVEL", "DELIVERY", "URGENT", "BOTH"], "Choose a request type.") requestType!: string;
  @RequiredText("Your name is required.", 150) name!: string;
  @ApiProperty() @Matches(/^[6-9]\d{9}$/) phone!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @RequiredText("Starting location is required.", 150) origin!: string;
  @RequiredText("Destination is required.", 150) destination!: string;
  @ApiProperty({ format: "date" }) @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) travelDate!: string;
  @ApiProperty() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) preferredTime!: string;
  @OptionalText(1000) itemDetails?: string | null;
  @OptionalText(2000) instructions?: string | null;
  @RequiredChoice(["IN_APP", "EMAIL"], "Choose an available notification method.") notificationMethod!: string;
  @RequiredChoice(["hi", "en"], "Choose Hindi or English.") lang!: string;
  @ApiProperty() @Equals(true) consent!: boolean;
}
// A direct request from Available Journeys & Requests: "Request Parcel Delivery" / "Request to Travel Together" on a
// travel plan (requestType DELIVERY / TRAVEL), "Offer to Help" on a request (no requestType: the request's own).
export class SafarConnectDto {
  @ApiProperty() @IsUUID() clientRequestId!: string;
  @ApiPropertyOptional({ enum: ["DELIVERY", "TRAVEL"] }) @IsOptional() @IsIn(["DELIVERY", "TRAVEL"]) requestType?: string;
  @OptionalText(1000) itemDetails?: string | null;
  @OptionalText(2000) instructions?: string | null;
  @ApiPropertyOptional({ description: "Your preferred time (HH:MM); defaults to the entry's time" })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  preferredTime?: string;
  @ApiPropertyOptional({ enum: ["IN_APP", "EMAIL"] }) @IsOptional() @IsIn(["IN_APP", "EMAIL"]) notificationMethod?: string;
  @RequiredChoice(["hi", "en"], "Choose Hindi or English.") lang!: string;
  @ApiProperty() @Equals(true) consent!: boolean;
}
// Available Journeys & Requests: optional route and date/time the member is looking for (ranks and filters).
export class SafarAvailableQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) origin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) destination?: string;
  @ApiPropertyOptional({ format: "date" }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time?: string;
}
export class SafarDecisionDto {
  @ApiProperty({ enum: ["ACCEPT", "DECLINE", "COMPLETE"] }) @IsIn(["ACCEPT", "DECLINE", "COMPLETE"]) decision!: string;
}

export const SAFAR_ADMIN_STATUSES = ["OPEN", "COMPLETED", "CANCELLED", "CLOSED", "ARCHIVED"] as const;
export class SafarAdminQueryDto {
  @ApiPropertyOptional({ enum: SAFAR_ADMIN_STATUSES }) @IsOptional() @IsIn(SAFAR_ADMIN_STATUSES) status?: string;
  @ApiPropertyOptional({ enum: ["REQUEST", "OFFER"] }) @IsOptional() @IsIn(["REQUEST", "OFFER"]) kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}
export class SafarAdminUpdateDto {
  @ApiProperty({ enum: SAFAR_ADMIN_STATUSES }) @IsIn(SAFAR_ADMIN_STATUSES) status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}
