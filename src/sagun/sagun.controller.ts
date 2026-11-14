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
  Query,
  RequestMethod,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import { uploadLimiter } from "../common/rate-limit/limiters.js";
import type { UserRow } from "../common/session/session.service.js";
import { SagunConfigDto, SagunInquiryActionDto, SagunInquiryDto, SagunReviewDto, SagunSaveDto, SagunSearchDto } from "./sagun.dto.js";
import { SagunService } from "./sagun.service.js";
@ApiTags("Sagun")
@Controller("sagun")
export class SagunController {
  constructor(private readonly service: SagunService) {}
  @Get("schema") schema() {
    return this.service.schema();
  }
  @Get("me") @UseGuards(UserGuard) @ApiBearerAuth() mine(@CurrentUser() user: UserRow) {
    return this.service.mine(user);
  }
  @Get("profiles") @UseGuards(UserGuard) @ApiBearerAuth() browse(@Query() query: SagunSearchDto, @CurrentUser() user: UserRow) {
    return this.service.browse(query, user);
  }
  @Post("profiles") @UseGuards(UserGuard) @ApiBearerAuth() create(@Body() dto: SagunSaveDto, @CurrentUser() user: UserRow) {
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
    consumer.apply(uploadLimiter).forRoutes({ path: "sagun/profiles/:id/files/:kind", method: RequestMethod.POST });
  }
}
