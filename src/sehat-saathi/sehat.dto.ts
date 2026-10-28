import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { OptionalChoice, OptionalText, RequiredChoice, RequiredText } from "../common/validation/fields.js";
export const assistanceTypes = ["SAMPLES", "ALTERNATIVES", "BOTH"] as const;
export const requestStatuses = ["PENDING", "IN_PROGRESS", "ASSISTANCE_FOUND", "CLOSED", "REJECTED"] as const;
export class SehatMrDto {
  @OptionalText(64) ownerUserId?: string;
  @RequiredText("Name required", 150) name!: string;
  @RequiredText("Membership ID required", 255) membershipId!: string;
  @RequiredText("Company required", 180) company!: string;
  @RequiredText("Role required", 150) role!: string;
  @RequiredText("City required", 150) city!: string;
  @ApiProperty({ type: [String], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  areas!: string[];
  @ApiProperty({ pattern: "^[6-9][0-9]{9}$" })
  @Matches(/^[6-9]\d{9}$/)
  phone!: string;
  @ApiPropertyOptional({ pattern: "^[6-9][0-9]{9}$", nullable: true })
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/)
  whatsapp?: string;
  @RequiredChoice(assistanceTypes, "Assistance required") assistance!: string;
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  publishContact!: boolean;
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  emailOptIn!: boolean;
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  whatsappOptIn!: boolean;
  @RequiredChoice(["hi", "en"], "Language required") lang!: string;
  @ApiProperty({ enum: [true] })
  @Equals(true)
  consent!: boolean;
}
export class AdminMrDto extends PartialType(SehatMrDto) {
  @OptionalChoice(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]) status?: string;
  @OptionalText(1000) reviewNote?: string;
}
export class SehatRequestDto {
  @OptionalText(64) ownerUserId?: string;
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  clientRequestId!: string;
  @RequiredText("Medicine required", 180) medicine!: string;
  @OptionalText(200) composition?: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity!: number;
  @RequiredChoice(["SAMPLES", "ALTERNATIVES"], "Assistance required") assistance!: string;
  @RequiredText("City required", 150) city!: string;
  @RequiredText("Area required", 150) area!: string;
  @RequiredText("Name required", 150) name!: string;
  @ApiProperty({ pattern: "^[6-9][0-9]{9}$" })
  @Matches(/^[6-9]\d{9}$/)
  phone!: string;
  @ApiPropertyOptional({ pattern: "^[6-9][0-9]{9}$", nullable: true })
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/)
  whatsapp?: string;
  @OptionalText(1500) notes?: string;
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  emailOptIn!: boolean;
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  whatsappOptIn!: boolean;
  @RequiredChoice(["hi", "en"], "Language required") lang!: string;
  @ApiProperty({ enum: [true] })
  @Equals(true)
  consent!: boolean;
}
export class AdminRequestDto extends PartialType(SehatRequestDto) {
  @OptionalChoice(requestStatuses) status?: string;
  @OptionalText(64) assignedMrId?: string | null;
}
export class ResourceDto {
  @RequiredText("English title required", 200) titleEn!: string;
  @RequiredText("Hindi title required", 200) titleHi!: string;
  @RequiredText("English description required", 1500) descriptionEn!: string;
  @RequiredText("Hindi description required", 1500) descriptionHi!: string;
  @RequiredText("Source required", 200) source!: string;
  @ApiProperty({ type: String, format: "uri" })
  @IsUrl({ protocols: ["https"], require_protocol: true, disallow_auth: true })
  @MaxLength(2000)
  url!: string;
  @RequiredChoice(["HEALTH", "DOCTOR", "HOSPITAL", "EMERGENCY", "MEDICINE"], "Category required") category!: string;
  @OptionalText(150) city?: string;
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  published!: boolean;
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  verified!: boolean;
}
export class ResourceUpdateDto extends PartialType(ResourceDto) {}
export class ReportDto {
  @RequiredChoice(["MR", "REQUEST", "RESOURCE"], "Target required") targetType!: string;
  @RequiredText("Target required", 64) targetId!: string;
  @RequiredText("Message required", 2000) message!: string;
}
export class ReportUpdateDto extends PartialType(ReportDto) {
  @OptionalChoice(["OPEN", "REVIEW", "RESOLVED", "DISMISSED"]) status?: string;
  @OptionalText(2000) resolution?: string;
}
export class MrRequestActionDto {
  @RequiredChoice(["ACCEPT", "DECLINE", "ASSISTANCE_FOUND", "CLOSED"], "Action required") action!: string;
}
