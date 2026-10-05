import { Body, Controller, Delete, Get, HttpCode, Post, Put, Req, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo, OkVo } from "../common/filters/error.vo.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import { bearerToken, type UserRow } from "../common/session/session.service.js";
import { AUTH_ROUTES as R } from "./auth.routes.js";
import { AuthService } from "./auth.service.js";
import { ChangePasswordDto, EmailDto, InviteDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyOtpDto } from "./dto/auth.dto.js";
import { InvitationVo, PublicUserVo, RegistrationVo, SessionVo } from "./vo/auth.vo.js";

@ApiTags("auth")
@ApiTooManyRequestsResponse({ description: "Rate limit exceeded (auth and OTP routes)" })
@Controller(R.base)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post(R.register)
  @ApiOperation({ summary: "Register an account; an OTP is emailed to verify it" })
  @ApiCreatedResponse({ type: RegistrationVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "reCAPTCHA failed, missing/short password or invalid mobile" })
  @ApiConflictResponse({ type: ErrorVo, description: "Mobile or email already registered" })
  register(@Body() body: RegisterDto): Promise<RegistrationVo> {
    return this.auth.register(body);
  }

  @Post(R.verifyOtp)
  @HttpCode(200)
  @ApiOperation({ summary: "Verify an emailed OTP and start a session" })
  @ApiOkResponse({ type: SessionVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Malformed, wrong or expired code" })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Account not found" })
  verifyOtp(@Body() body: VerifyOtpDto): Promise<SessionVo> {
    return this.auth.verifyOtp(body);
  }

  @Post(R.resendOtp)
  @HttpCode(200)
  @ApiOperation({ summary: "Email a new OTP to an unverified account (same response either way)" })
  @ApiOkResponse({ type: OkVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Email missing" })
  resendOtp(@Body() body: EmailDto): Promise<OkVo> {
    return this.auth.resendOtp(body);
  }

  @Post(R.login)
  @HttpCode(200)
  @ApiOperation({ summary: "Log in with email or mobile and password" })
  @ApiOkResponse({ type: SessionVo })
  @ApiUnauthorizedResponse({ type: ErrorVo, description: "Invalid credentials" })
  @ApiForbiddenResponse({ type: ErrorVo, description: "Account not verified yet" })
  login(@Body() body: LoginDto): Promise<SessionVo> {
    return this.auth.login(body);
  }

  @Post(R.resetRequest)
  @HttpCode(200)
  @ApiOperation({ summary: "Email a password-reset link (same response either way)" })
  @ApiOkResponse({ type: OkVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Email missing" })
  requestPasswordReset(@Body() body: EmailDto): Promise<OkVo> {
    return this.auth.requestPasswordReset(body);
  }

  @Post(R.resetPassword)
  @HttpCode(200)
  @ApiOperation({ summary: "Set a new password using the emailed reset token" })
  @ApiOkResponse({ type: OkVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Missing input, short password, or invalid/expired token" })
  resetPassword(@Body() body: ResetPasswordDto): Promise<OkVo> {
    return this.auth.resetPassword(body);
  }

  @Post(R.invite)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Invite (or re-invite) a user with a temporary password — admin only" })
  @ApiCreatedResponse({ type: InvitationVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Email missing" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo, description: "Not an admin" })
  invite(@Body() body: InviteDto): Promise<InvitationVo> {
    return this.auth.invite(body);
  }

  @Put(R.changePassword)
  @HttpCode(200)
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change the logged-in user's password" })
  @ApiOkResponse({ type: OkVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "New password too short" })
  @ApiUnauthorizedResponse({ type: ErrorVo, description: "Not logged in, or current password wrong" })
  changePassword(@CurrentUser() user: UserRow, @Body() body: ChangePasswordDto): Promise<OkVo> {
    return this.auth.changePassword(user, body);
  }

  @Get(R.me)
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "The logged-in user" })
  @ApiOkResponse({ type: PublicUserVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  me(@CurrentUser() user: UserRow): PublicUserVo {
    return this.auth.me(user);
  }

  @Delete(R.logout)
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: "End the current session" })
  @ApiNoContentResponse({ description: "Session ended" })
  @ApiInternalServerErrorResponse({ type: ErrorVo, description: "Unexpected server or database error" })
  async logout(@Req() request: Request): Promise<void> {
    await this.auth.logout(bearerToken(request));
  }
}
