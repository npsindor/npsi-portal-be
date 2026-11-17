import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { BOOKLET_GROUPINGS, CARD_LAYOUTS } from "./sagun-booklet.plan.js";

export const CARD_STATES = ["PENDING", "APPROVED", "REJECTED", "INACTIVE"] as const;
export const CARD_CATEGORIES = ["GROOM", "BRIDE"] as const;
export const CARD_SORTS = ["name", "date"] as const;
export const MAX_BOOKLET_PROFILES = 500;

const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === "string" && !value.trim() ? undefined : typeof value === "string" ? value.trim() : value;
const toBoolean = ({ value }: { value: unknown }) => (value === "true" ? true : value === "false" ? false : value);
const toNumber = ({ value }: { value: unknown }) => (typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value);

export class SagunCardListDto {
  @ApiPropertyOptional({ enum: CARD_STATES }) @Transform(blankToUndefined) @IsOptional() @IsIn(CARD_STATES) state?: (typeof CARD_STATES)[number];
  @ApiPropertyOptional({ enum: CARD_CATEGORIES }) @Transform(blankToUndefined) @IsOptional() @IsIn(CARD_CATEGORIES) category?: (typeof CARD_CATEGORIES)[number];
  @ApiPropertyOptional({ description: "Name or Shagun profile ID" }) @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ description: "Village / city contains" }) @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(100) place?: string;
  @ApiPropertyOptional({ description: "Only cards selected for the booklet" }) @Transform(toBoolean) @IsOptional() @IsBoolean() selected?: boolean;
  @ApiPropertyOptional({ description: "Only cards that may go into a booklet" }) @Transform(toBoolean) @IsOptional() @IsBoolean() eligible?: boolean;
  @ApiPropertyOptional({ enum: CARD_SORTS }) @Transform(blankToUndefined) @IsOptional() @IsIn(CARD_SORTS) sort?: (typeof CARD_SORTS)[number];
}

export class SagunCardSelectionDto {
  @ApiProperty({ type: [String], description: "Shagun profile ids" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  profileIds!: string[];
  @ApiProperty() @IsBoolean() selected!: boolean;
}

export class SagunBookletDto {
  @ApiProperty({ type: [String], description: "Approved, publishable Shagun profile ids" })
  @IsArray()
  @ArrayMinSize(1, { message: "SAGUN_BOOKLET_EMPTY" })
  @ArrayMaxSize(MAX_BOOKLET_PROFILES, { message: "SAGUN_BOOKLET_TOO_LARGE" })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  profileIds!: string[];
  @ApiProperty({ enum: CARD_LAYOUTS, description: "Cards per A4 page" }) @Transform(toNumber) @IsIn(CARD_LAYOUTS) layout!: (typeof CARD_LAYOUTS)[number];
  @ApiProperty({ enum: BOOKLET_GROUPINGS }) @IsIn(BOOKLET_GROUPINGS) grouping!: (typeof BOOKLET_GROUPINGS)[number];
  @ApiProperty() @IsBoolean() includeCover!: boolean;
  @ApiProperty() @IsBoolean() includeIndex!: boolean;
  @ApiProperty() @IsBoolean() includeClosing!: boolean;
  @ApiPropertyOptional({ enum: CARD_SORTS }) @IsOptional() @IsIn(CARD_SORTS) sort?: (typeof CARD_SORTS)[number];
  @ApiPropertyOptional({ example: "शगुन बंधन – वैवाहिक परिचय पुस्तिका" }) @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional({ example: "प्रथम संस्करण" }) @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(60) edition?: string;
  @ApiPropertyOptional({ description: "Extra contact line for the closing page (phone, office address)" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactLine?: string;
}
