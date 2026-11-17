import {
  Body,
  Controller,
  Delete,
  Get,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Param,
  Patch,
  Post,
  Put,
  Query,
  RequestMethod,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { CurrentUser, OptionalUser } from "../common/decorators/current-user.decorator.js";
import { AdminGuard, OptionalUserGuard, UserGuard } from "../common/guards/auth.guards.js";
import { sagunSubmitLimiter, uploadLimiter } from "../common/rate-limit/limiters.js";
import type { UserRow } from "../common/session/session.service.js";
import {
  SagunAdminEditDto,
  SagunAdminListDto,
  SagunConfigDto,
  SagunInquiryActionDto,
  SagunInquiryDto,
  SagunReviewDto,
  SagunSaveDto,
  SagunSearchDto,
  SagunSettingsDto,
} from "./sagun.dto.js";
import { SagunService } from "./sagun.service.js";
@ApiTags("Shagun")
@Controller("sagun")
export class SagunController {
  constructor(private readonly service: SagunService) {}
  @Get("schema") schema() {
    return this.service.schema();
  }
  @Get("eligible-members")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Members of the caller's registered family, with Shagun eligibility computed from the family record" })
  @ApiResponse({ status: 200, description: "Family and members" })
  @ApiResponse({ status: 403, description: "SAGUN_MEMBER_REQUIRED: the caller has no ACTIVE registered family" })
  eligibleMembers(@CurrentUser() user: UserRow) {
    return this.service.eligibleMembers(user);
  }
  @Get("eligible-members/:memberId")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Eligibility check and form pre-fill for one member of the caller's family" })
  @ApiResponse({ status: 200, description: "Member facts, eligibility, existing application and pre-filled form values" })
  @ApiResponse({ status: 403, description: "SAGUN_MEMBER_REQUIRED / SAGUN_MEMBER_NOT_IN_FAMILY" })
  memberPrefill(@Param("memberId") memberId: string, @CurrentUser() user: UserRow) {
    return this.service.memberPrefill(memberId, user);
  }
  @Get("me") @UseGuards(UserGuard) @ApiBearerAuth() mine(@CurrentUser() user: UserRow) {
    return this.service.mine(user);
  }
  @Get("profiles") @UseGuards(UserGuard) @ApiBearerAuth() browse(@Query() query: SagunSearchDto, @CurrentUser() user: UserRow) {
    return this.service.browse(query, user);
  }
  @Post("profiles") @UseGuards(OptionalUserGuard) @ApiBearerAuth() create(@Body() dto: SagunSaveDto, @OptionalUser() user: UserRow | null) {
    return this.service.save(undefined, dto, user);
  }
  @Get("profiles/:id") @UseGuards(UserGuard) @ApiBearerAuth() detail(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.detail(id, user);
  }
  @Patch("profiles/:id") @UseGuards(UserGuard) @ApiBearerAuth() save(@Param("id") id: string, @Body() dto: SagunSaveDto, @CurrentUser() user: UserRow) {
    return this.service.save(id, dto, user);
  }
  @Patch("profiles/:id/deactivation") @UseGuards(UserGuard) @ApiBearerAuth() deactivate(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.deactivate(id, user);
  }
  @Patch("profiles/:id/consent-withdrawal") @UseGuards(UserGuard) @ApiBearerAuth() withdrawConsent(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.withdrawConsent(id, user);
  }
  @Delete("profiles/:id") @UseGuards(UserGuard) @ApiBearerAuth() remove(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.remove(id, user);
  }
  @Patch("admin/profiles/:id/review") @UseGuards(AdminGuard) @ApiBearerAuth() review(
    @Param("id") id: string,
    @Body() dto: SagunReviewDto,
    @CurrentUser() user: UserRow,
  ) {
    return this.service.review(id, dto, user);
  }
  @Get("admin/stats")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Shagun dashboard counts (applications exclude drafts)" })
  @ApiResponse({ status: 200, description: "Counts by status and gender" })
  stats(@CurrentUser() user: UserRow) {
    return this.service.stats(user);
  }
  @Get("admin/profiles")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Search and filter Shagun applications" })
  @ApiResponse({ status: 200, description: "{ total, records }" })
  adminList(@Query() query: SagunAdminListDto, @CurrentUser() user: UserRow) {
    return this.service.adminList(query, user);
  }
  @Patch("admin/profiles/:id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Correct application details (logged with remarks); identity, consents and files are protected" })
  @ApiResponse({ status: 200, description: "Updated profile" })
  @ApiResponse({ status: 400, description: "SAGUN_ADMIN_EDIT_FIELD / SAGUN_FIELD:<key>" })
  adminEdit(@Param("id") id: string, @Body() dto: SagunAdminEditDto, @CurrentUser() user: UserRow) {
    return this.service.adminEdit(id, dto, user);
  }
  @Get("admin/profiles/:id/logs")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Status and correction history of one application" })
  @ApiResponse({ status: 200, description: "Log rows, newest first" })
  logs(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.applicationLogs(id, user);
  }
  @Get("admin/settings")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Shagun registration settings" })
  @ApiResponse({ status: 200, description: "Settings" })
  settings(@CurrentUser() user: UserRow) {
    return this.service.adminSettings(user);
  }
  @Put("admin/settings")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update Shagun registration settings (minimum ages cannot go below 18 / 21)" })
  @ApiResponse({ status: 200, description: "Settings" })
  @ApiResponse({ status: 400, description: "Validation error" })
  updateSettings(@Body() dto: SagunSettingsDto, @CurrentUser() user: UserRow) {
    return this.service.updateSettings(dto, user);
  }
  @Get("admin") @UseGuards(AdminGuard) @ApiBearerAuth() admin(@CurrentUser() user: UserRow) {
    return this.service.adminData(user);
  }
  @Patch("admin/schema") @UseGuards(AdminGuard) @ApiBearerAuth() configure(@Body() dto: SagunConfigDto, @CurrentUser() user: UserRow) {
    return this.service.configure(dto, user);
  }
  @Post("profiles/:id/inquiries") @UseGuards(UserGuard) @ApiBearerAuth() inquiry(
    @Param("id") id: string,
    @Body() dto: SagunInquiryDto,
    @CurrentUser() user: UserRow,
  ) {
    return this.service.inquiry(id, dto, user);
  }
  @Patch("inquiries/:id") @UseGuards(UserGuard) @ApiBearerAuth() action(
    @Param("id") id: string,
    @Body() dto: SagunInquiryActionDto,
    @CurrentUser() user: UserRow,
  ) {
    return this.service.inquiryAction(id, dto, user);
  }
  @Post("profiles/:id/files/:kind")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 } }))
  upload(
    @Param("id") id: string,
    @Param("kind") kind: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("consent") consent: string,
    @CurrentUser() user: UserRow,
  ) {
    return this.service.upload(id, kind, file, consent, user);
  }
  @Get("files/:id") @UseGuards(UserGuard) @ApiBearerAuth() async file(@Param("id") id: string, @CurrentUser() user: UserRow, @Res() response: Response) {
    const file = await this.service.file(id, user);
    response
      .set({
        "Content-Type": file.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Content-Disposition": `${file.mime.startsWith("image/") ? "inline" : "attachment"}; filename="${file.filename}"`,
      })
      .send(file.buffer);
  }
  @Delete("files/:id") @UseGuards(UserGuard) @ApiBearerAuth() deleteFile(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.deleteFile(id, user);
  }
}
@Module({ controllers: [SagunController], providers: [SagunService] })
export class SagunModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(sagunSubmitLimiter).forRoutes({ path: "sagun/profiles", method: RequestMethod.POST });
    consumer.apply(uploadLimiter).forRoutes({ path: "sagun/profiles/:id/files/:kind", method: RequestMethod.POST });
  }
}
