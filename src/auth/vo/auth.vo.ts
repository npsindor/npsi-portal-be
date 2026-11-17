import { ApiProperty } from "@nestjs/swagger";
import type { LoginAccount } from "../../common/eligibility/login-account.js";
import type { UserRow } from "../../common/session/session.service.js";

// The only user fields the API ever returns.
export class PublicUserVo {
  @ApiProperty({ example: "5f0c…" }) id: string;
  @ApiProperty({ example: "member@example.com", nullable: true }) email: string | null;
  @ApiProperty({ type: "string", example: "Ram Patidar", nullable: true }) fullName: string | null;
  @ApiProperty({ example: "9876543210", nullable: true }) phone: string | null;
  @ApiProperty({ example: "user", enum: ["user", "admin"], nullable: true }) role: string | null;
  @ApiProperty({ type: "string", nullable: true, description: "Profile photo URL" }) photoUrl: string | null;

  static from(user: UserRow): PublicUserVo {
    return { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, role: user.role, photoUrl: user.photoUrl };
  }
}

// Which portal the account belongs to, decided by the server from the registration records.
export class AccountVo {
  @ApiProperty({ enum: ["ADMIN", "FAMILY", "STUDENT", "NONE"], description: "NONE: no family or student registration yet" }) type: string;
  @ApiProperty({ enum: ["ACTIVE", "PENDING", "CORRECTION_REQUIRED", "REJECTED", "SUSPENDED", "INACTIVE", "NONE"] }) status: string;

  static from(account: LoginAccount): AccountVo {
    return { type: account.type, status: account.status };
  }
}

export class MeVo extends PublicUserVo {
  @ApiProperty({ type: AccountVo }) account: AccountVo;
}

// GET /auth/sessions/current: always 200, so a visitor who is not logged in is not an error.
export class CurrentSessionVo {
  @ApiProperty({ type: MeVo, nullable: true, description: "The logged-in user, or null when there is no valid session" }) user: MeVo | null;
}

export class RegistrationVo {
  @ApiProperty({ type: PublicUserVo }) user: PublicUserVo;
  @ApiProperty({ example: true }) requiresOtp: true;
}

// The session token travels only in the httpOnly `npsi_session` cookie (30 days), never in the body,
// so no script on the page can read it.
export class SessionVo {
  @ApiProperty({ type: PublicUserVo }) user: PublicUserVo;
  @ApiProperty({ type: AccountVo, required: false, description: "Password and email-code sign-in: the account's portal and status" }) account?: AccountVo;
}

// What the service hands the controller: the session plus its token, which the controller puts in the cookie.
export type IssuedSession = SessionVo & { accessToken: string };

export class InvitationVo {
  @ApiProperty({ example: true }) ok: true;
  @ApiProperty({ example: "new.member@example.com" }) username: string;
  @ApiProperty({
    example: "NPS@a1B2c3D4!",
    description: "Temporary password, also emailed; null when the account already had its own password",
    nullable: true,
    type: String,
  })
  password: string | null;
}

export class MobileOtpVo {
  @ApiProperty({ example: true }) ok: true;
  @ApiProperty({ enum: ["WHATSAPP", "SMS", "EMAIL", "DEV"], description: "Where the code was sent" }) channel: string;
  @ApiProperty({ example: 600 }) expiresInSeconds: number;
}

export class MobileVerificationVo {
  @ApiProperty({ description: "Single-use token for registration or password reset, valid 15 minutes" }) verificationToken: string;
}
