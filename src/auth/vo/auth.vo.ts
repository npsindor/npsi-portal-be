import { ApiProperty } from "@nestjs/swagger";
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

export class RegistrationVo {
  @ApiProperty({ type: PublicUserVo }) user: PublicUserVo;
  @ApiProperty({ example: true }) requiresOtp: true;
}

export class SessionVo {
  @ApiProperty({ type: PublicUserVo }) user: PublicUserVo;
  @ApiProperty({ example: "64 hex characters", description: "Bearer token, valid for 30 days" }) accessToken: string;
}

export class InvitationVo {
  @ApiProperty({ example: true }) ok: true;
  @ApiProperty({ example: "new.member@example.com" }) username: string;
  @ApiProperty({ example: "NPS@a1B2c3D4!", description: "Temporary password, also emailed to the user" }) password: string;
}
