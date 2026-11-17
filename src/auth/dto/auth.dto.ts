import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional } from "class-validator";
import { OptionalText } from "../../common/validation/fields.js";

// Request DTOs for the auth endpoints. Every field is optional at the DTO
// level on purpose: the services validate them with the exact legacy error
// messages and status codes, so stricter DTO rules would change behavior.
// The DTOs document the contract and whitelist the accepted fields.

export class RegisterDto {
  @ApiPropertyOptional({ example: "member@example.com" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ example: "secret1", minLength: 8 }) @IsOptional() password?: string;
  @ApiPropertyOptional({ example: "Ram Patidar" }) @IsOptional() fullName?: string;
  @ApiPropertyOptional({ example: "9876543210", description: "10-digit Indian mobile starting 6-9" }) @IsOptional() phone?: string;
  @ApiPropertyOptional({ description: "Google reCAPTCHA v3 token (required when the server has a secret configured)" }) @IsOptional() recaptchaToken?: string;
}

export class VerifyOtpDto {
  @ApiPropertyOptional({ example: "member@example.com" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ example: "123456" }) @IsOptional() otpCode?: string;
  @ApiPropertyOptional({
    enum: ["FAMILY", "STUDENT"],
    default: "FAMILY",
    description: "Login portal. The server checks it against the account's own registration and refuses the other portal.",
  })
  @IsOptional()
  portal?: string;
}

export class EmailDto {
  @ApiPropertyOptional({ example: "member@example.com" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ description: "Google reCAPTCHA v3 token (required when the server has a secret configured)" }) @IsOptional() recaptchaToken?: string;
}

export class LoginDto {
  @ApiPropertyOptional({ example: "member@example.com", description: "Email or mobile; `phone` or `username` are accepted too" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ example: "9876543210" }) @IsOptional() phone?: string;
  @ApiPropertyOptional({ example: "member@example.com" }) @IsOptional() username?: string;
  @ApiPropertyOptional({ example: "secret1" }) @IsOptional() password?: string;
  @ApiPropertyOptional({
    enum: ["FAMILY", "STUDENT"],
    default: "FAMILY",
    description: "Login portal. The server checks it against the account's own registration and refuses the other portal.",
  })
  @IsOptional()
  portal?: string;
  @ApiPropertyOptional({ description: "Google reCAPTCHA v3 token (required when the server has a secret configured)" }) @IsOptional() recaptchaToken?: string;
}

export class ResetPasswordDto {
  @ApiPropertyOptional({ description: "Token from the reset email" }) @IsOptional() resetToken?: string;
  @ApiPropertyOptional({ example: "9876543210", description: "Mobile reset: the verified mobile (with verificationToken instead of resetToken)" })
  @IsOptional()
  phone?: string;
  @ApiPropertyOptional({ description: "Mobile reset: token from POST /auth/mobile-otps/verifications (purpose RESET)" })
  @IsOptional()
  verificationToken?: string;
  @ApiPropertyOptional({ example: "newSecret1", minLength: 8 }) @IsOptional() newPassword?: string;
}

export class InviteDto {
  @ApiPropertyOptional({ example: "new.member@example.com" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ enum: ["user", "admin"], default: "user" }) @IsOptional() role?: string;
  @ApiPropertyOptional({ example: "Ram Patidar" }) @IsOptional() fullName?: string;
  @ApiPropertyOptional({ example: "9876543210" }) @IsOptional() phone?: string;
}

// The logged-in user's own profile; omitted fields stay as they are.
export class UpdateMeDto {
  @OptionalText(255, { description: "Full name" })
  fullName?: string | null;

  @OptionalText(20, { description: "10-digit Indian mobile starting 6-9" })
  phone?: string | null;

  @OptionalText(255, { description: "Required to change the mobile: token from POST /auth/mobile-otps/verifications (purpose REGISTER) for the new number" })
  phoneVerificationToken?: string | null;

  @OptionalText(undefined, { description: "Profile photo: a URL returned by POST /uploads" })
  photoUrl?: string | null;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: "oldSecret1" }) @IsOptional() currentPassword?: string;
  @ApiPropertyOptional({ example: "newSecret1", minLength: 8 }) @IsOptional() newPassword?: string;
}

export class MobileOtpDto {
  @ApiPropertyOptional({ example: "9876543210" }) @IsOptional() mobile?: string;
  @ApiPropertyOptional({ enum: ["REGISTER", "RESET"], default: "REGISTER" }) @IsOptional() purpose?: string;
  @ApiPropertyOptional({ description: "Registration only: optional email, also used to deliver the code while WhatsApp/SMS is unavailable" })
  @IsOptional()
  email?: string;
  @ApiPropertyOptional({ description: "Google reCAPTCHA v3 token (registration and password reset)" }) @IsOptional() recaptchaToken?: string;
}

export class VerifyMobileOtpDto {
  @ApiPropertyOptional({ example: "9876543210" }) @IsOptional() mobile?: string;
  @ApiPropertyOptional({ enum: ["REGISTER", "RESET"], default: "REGISTER" }) @IsOptional() purpose?: string;
  @ApiPropertyOptional({ example: "123456" }) @IsOptional() code?: string;
}

export class MobileRegisterDto {
  @ApiPropertyOptional({ example: "9876543210" }) @IsOptional() phone?: string;
  @ApiPropertyOptional({ description: "Token from POST /auth/mobile-otps/verifications (purpose REGISTER)" }) @IsOptional() verificationToken?: string;
  @ApiPropertyOptional({ example: "secret1", minLength: 8 }) @IsOptional() password?: string;
  @ApiPropertyOptional({ example: "member@example.com" }) @IsOptional() email?: string;
  @ApiPropertyOptional({ example: "Ram Patidar" }) @IsOptional() fullName?: string;
}
