import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional } from "class-validator";

// Request DTOs for the auth endpoints. Every field is optional at the DTO
// level on purpose: the services validate them with the exact legacy error
// messages and status codes, so stricter DTO rules would change behavior.
// The DTOs document the contract and whitelist the accepted fields.

export class RegisterDto {
  @ApiPropertyOptional({ example: "member@example.com" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ example: "secret1", minLength: 6 }) @IsOptional() password?: string;
  @ApiPropertyOptional({ example: "Ram Patidar" }) @IsOptional() full_name?: string;
  @ApiPropertyOptional({ example: "9876543210", description: "10-digit Indian mobile starting 6-9" }) @IsOptional() phone?: string;
  @ApiPropertyOptional({ description: "Google reCAPTCHA v3 token (required when the server has a secret configured)" }) @IsOptional() recaptchaToken?: string;
}

export class VerifyOtpDto {
  @ApiPropertyOptional({ example: "member@example.com" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ example: "123456" }) @IsOptional() otpCode?: string;
}

export class EmailDto {
  @ApiPropertyOptional({ example: "member@example.com" }) @IsOptional() email?: string;
}

export class LoginDto {
  @ApiPropertyOptional({ example: "member@example.com", description: "Email or mobile; `phone` or `username` are accepted too" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ example: "9876543210" }) @IsOptional() phone?: string;
  @ApiPropertyOptional({ example: "member@example.com" }) @IsOptional() username?: string;
  @ApiPropertyOptional({ example: "secret1" }) @IsOptional() password?: string;
}

export class ResetPasswordDto {
  @ApiPropertyOptional({ description: "Token from the reset email" }) @IsOptional() resetToken?: string;
  @ApiPropertyOptional({ example: "newSecret1", minLength: 6 }) @IsOptional() newPassword?: string;
}

export class InviteDto {
  @ApiPropertyOptional({ example: "new.member@example.com" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ enum: ["user", "admin"], default: "user" }) @IsOptional() role?: string;
  @ApiPropertyOptional({ example: "Ram Patidar" }) @IsOptional() full_name?: string;
  @ApiPropertyOptional({ example: "9876543210" }) @IsOptional() phone?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: "oldSecret1" }) @IsOptional() currentPassword?: string;
  @ApiPropertyOptional({ example: "newSecret1", minLength: 6 }) @IsOptional() newPassword?: string;
}
