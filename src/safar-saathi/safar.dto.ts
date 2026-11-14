import { ApiProperty } from "@nestjs/swagger";
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
export class SafarDecisionDto {
  @ApiProperty({ enum: ["ACCEPT", "DECLINE", "COMPLETE"] }) @IsIn(["ACCEPT", "DECLINE", "COMPLETE"]) decision!: string;
}
