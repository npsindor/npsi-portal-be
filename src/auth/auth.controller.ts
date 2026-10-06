import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
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
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo, OkVo } from "../common/filters/error.vo.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import { bearerToken, type UserRow } from "../common/session/session.service.js";
import { clearSessionCookie, setSessionCookie } from "../common/session/session-cookie.js";
import { AppConfigService } from "../config/app-config.service.js";
import { AUTH_ROUTES as R } from "./auth.routes.js";
import { AuthService } from "./auth.service.js";
import { ChangePasswordDto, EmailDto, InviteDto, LoginDto, RegisterDto, ResetPasswordDto, UpdateMeDto, VerifyOtpDto } from "./dto/auth.dto.js";
import { InvitationVo, PublicUserVo, RegistrationVo, SessionVo } from "./vo/auth.vo.js";

@ApiTags("auth")
@ApiTooManyRequestsResponse({ description: "Rate limit exceeded (auth and OTP routes)" })
@Controller(R.base)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  // Session cookies are Secure everywhere but local development (plain http://localhost).
  private get secureCookies(): boolean {
    return this.config.appEnv !== "development";
  }

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
  async verifyOtp(@Body() body: VerifyOtpDto, @Res({ passthrough: true }) response: Response): Promise<SessionVo> {
    const session = await this.auth.verifyOtp(body);
    setSessionCookie(response, session.accessToken, this.secureCookies);
    return session;
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
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response): Promise<SessionVo> {
    const session = await this.auth.login(body);
    setSessionCookie(response, session.accessToken, this.secureCookies);
    return session;
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
  changePassword(@CurrentUser() user: UserRow, @Body() body: ChangePasswordDto, @Req() request: Request): Promise<OkVo> {
    return this.auth.changePassword(user, body, bearerToken(request));
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

  @Patch(R.me)
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update the logged-in user's name, mobile or profile photo" })
  @ApiOkResponse({ type: PublicUserVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid mobile, photo not one of our uploads, or markup in a field" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiConflictResponse({ type: ErrorVo, description: "Mobile already registered to another account" })
  updateMe(@CurrentUser() user: UserRow, @Body() body: UpdateMeDto): Promise<PublicUserVo> {
    return this.auth.updateMe(user, body);
  }

  @Delete(R.login)
  @HttpCode(204)
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Log out everywhere", description: "Ends every session of the logged-in user, on all devices." })
  @ApiNoContentResponse({ description: "All sessions ended" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  async logoutEverywhere(@CurrentUser() user: UserRow, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logoutEverywhere(user);
    clearSessionCookie(response, this.secureCookies);
  }

  @Delete(R.logout)
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: "End the current session" })
  @ApiNoContentResponse({ description: "Session ended" })
  @ApiInternalServerErrorResponse({ type: ErrorVo, description: "Unexpected server or database error" })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(bearerToken(request));
    clearSessionCookie(response, this.secureCookies);
  }
}
