import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { Equals, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === "string" && !value.trim() ? undefined : typeof value === "string" ? value.trim() : value;

export const PUBLIC_MESSAGE_KINDS = ["CONTACT", "FEEDBACK"] as const;

// Public Contact Us / Feedback form (no login): stored with member feedback so admins answer it in Admin → Feedback.
export class PublicMessageDto {
  @ApiProperty({ enum: PUBLIC_MESSAGE_KINDS }) @IsIn(PUBLIC_MESSAGE_KINDS) kind!: (typeof PUBLIC_MESSAGE_KINDS)[number];
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsEmail({}, { message: "Enter a valid email address." }) @MaxLength(254) email?: string;
  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsOptional()
  @Matches(/^(\+?91[\s-]?)?[6-9]\d{9}$/, { message: "Enter a valid 10-digit mobile number." })
  mobile?: string;
  @ApiProperty({ example: "General" }) @Transform(blankToUndefined) @IsString() @MaxLength(60) category!: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150) subject?: string;
  @ApiProperty()
  @Transform(blankToUndefined)
  @IsString({ message: "Please write your message." })
  @MinLength(5, { message: "Please write your message." })
  @MaxLength(2000)
  message!: string;
  @ApiProperty() @Equals(true, { message: "Please accept the consent to submit." }) consent!: boolean;
  @ApiPropertyOptional({ enum: ["en", "hi"] }) @IsOptional() @IsIn(["en", "hi"]) lang?: "en" | "hi";
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) recaptchaToken?: string;
}
