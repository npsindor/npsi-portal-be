import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

export class CreateContactInfoDto {
  @ApiProperty({ maxLength: 150 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName!: string;

  @ApiProperty({ description: "Indian mobile number, optionally prefixed with +91", example: "9876543210" })
  @Transform(({ value }) =>
    typeof value === "string"
      ? value
          .trim()
          .replace(/[\s()-]/g, "")
          .replace(/^(?:\+91|91)(?=\d{10}$)/, "")
      : value,
  )
  @Matches(/^[6-9]\d{9}$/)
  contactNumber!: string;

  @ApiPropertyOptional({ format: "email", maxLength: 254 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() || undefined : value))
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ maxLength: 150, description: "Selected Indore area or the entered Other value" })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  indoreArea!: string;

  @ApiProperty({ maxLength: 150, description: "Selected Nimad village or the entered Other value" })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nativeVillage!: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  isStudent: boolean = false;

  @ApiPropertyOptional({ enum: ["en", "hi"], default: "en" })
  @IsIn(["en", "hi"])
  lang: "en" | "hi" = "en";
}

export class ContactInfoThanksVo {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: "Thank you! Your details have been saved." })
  message!: string;
}
