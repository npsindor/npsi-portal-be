import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { ApplicationsModule } from "../applications/applications.module.js";
import { AdminAreaGuard, AdminAreaRoute, CurrentAdminScope } from "../common/admin-access/admin-area.guard.js";
import { type AdminScope } from "../common/admin-access/admin-scope.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import { uploadDailyLimiter, uploadLimiter } from "../common/rate-limit/limiters.js";
import type { UserRow } from "../common/session/session.service.js";
import { LookupsModule } from "../lookups/lookups.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { StudentApplicationsModule } from "../student-applications/student-applications.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { TransactionVo } from "../transactions/vo/transactions.vo.js";
import { PaymentEditDto, PaymentReviewDto, RegistrationDto, RegistrationPaymentsQueryDto } from "./dto/registrations.dto.js";
import { MAX_SCREENSHOT_BYTES, PaymentFilesService } from "./payment-files.service.js";
import { RegistrationsService } from "./registrations.service.js";

const SCREENSHOT_PATH = "me/payment-screenshots";

@ApiTags("registrations")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorVo })
@Controller()
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Post(SCREENSHOT_PATH)
  @UseGuards(UserGuard)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_SCREENSHOT_BYTES, files: 1 } }))
  @ApiOperation({ summary: "Upload a UPI payment screenshot (private; JPG/PNG/WEBP, 5 MB); returns the file id for the registration" })
  @ApiCreatedResponse({ description: "{ fileId }" })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Not an image or too large" })
  uploadScreenshot(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: UserRow) {
    return this.service.uploadScreenshot(user, file);
  }

  @Get("me/registrations")
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "My registration applications, their payment status, the fees and my profile completion" })
  @ApiOkResponse({ description: "{ fees, registrations, completion }" })
  mine(@CurrentUser() user: UserRow) {
    return this.service.mine(user);
  }

  @Post("me/registrations")
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "Submit a family (₹500) or student (₹100) registration with the payment screenshot" })
  @ApiCreatedResponse({ description: "The registration with its payment" })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Validation error or missing screenshot" })
  @ApiConflictResponse({ type: ErrorVo, description: "Already registered / application already open" })
  submit(@Body() dto: RegistrationDto, @CurrentUser() user: UserRow) {
    return this.service.submit(user, dto);
  }

  @Put("me/registrations/:id")
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "Correct and resubmit after a correction request or a rejected payment" })
  @ApiOkResponse({ description: "The registration with its payment" })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiConflictResponse({ type: ErrorVo, description: "Not open for changes" })
  resubmit(@Param("id") id: string, @Body() dto: RegistrationDto, @CurrentUser() user: UserRow) {
    return this.service.resubmit(user, id, dto);
  }

  @Get("me/profile-completion")
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "How complete my profile is, and the next suggested step" })
  @ApiOkResponse({ description: "{ percent, steps, next }" })
  completion(@CurrentUser() user: UserRow) {
    return this.service.completionFor(user);
  }

  @Get("registration-payments")
  @UseGuards(AdminAreaGuard)
  @AdminAreaRoute("PAYMENTS")
  @ApiOperation({ summary: "Registration-fee payments with applicant details — admin only" })
  @ApiOkResponse({ description: "Payments, newest first" })
  @ApiForbiddenResponse({ type: ErrorVo })
  payments(@Query() query: RegistrationPaymentsQueryDto, @CurrentAdminScope() scope: AdminScope) {
    return this.service.payments(query, scope);
  }

  @Post("registration-payments/:id/review")
  @HttpCode(200)
  @UseGuards(AdminAreaGuard)
  @AdminAreaRoute("PAYMENTS")
  @ApiOperation({ summary: "Verify, reject (with remarks) or refund (with remarks) a registration payment; the applicant is notified — admin only" })
  @ApiOkResponse({ type: TransactionVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Remarks missing" })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiConflictResponse({ type: ErrorVo, description: "Not allowed from the current payment status" })
  @ApiForbiddenResponse({ type: ErrorVo })
  review(@Param("id") id: string, @Body() dto: PaymentReviewDto, @CurrentUser() user: UserRow, @CurrentAdminScope() scope: AdminScope) {
    return this.service.reviewPayment(id, dto, user, scope);
  }

  @Patch("registration-payments/:id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Super admin: correct a registration payment's amount, UTR or remarks (the status changes only through the review)" })
  @ApiOkResponse({ type: TransactionVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  editPayment(@Param("id") id: string, @Body() dto: PaymentEditDto) {
    return this.service.editPayment(id, dto);
  }

  @Delete("registration-payments/:id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Super admin: delete a registration payment (recorded in the audit log)",
    description: "Refused while its application still awaits a decision: deleting the fee would let it be approved without payment.",
  })
  @ApiNoContentResponse({ description: "Deleted" })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiConflictResponse({ type: ErrorVo, description: "The application still awaits a decision" })
  @ApiForbiddenResponse({ type: ErrorVo })
  async deletePayment(@Param("id") id: string): Promise<void> {
    await this.service.deletePayment(id);
  }

  @Get("registration-payments/:id/screenshot")
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "The payment screenshot (admin, or the applicant who uploaded it)" })
  @ApiOkResponse({ description: "Image bytes" })
  @ApiNotFoundResponse({ type: ErrorVo })
  async screenshot(@Param("id") id: string, @CurrentUser() user: UserRow, @Res() response: Response) {
    const file = await this.service.screenshot(id, user);
    response
      .set({
        "Content-Type": file.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      })
      .send(file.buffer);
  }
}

@Module({
  imports: [ApplicationsModule, StudentApplicationsModule, TransactionsModule, NotificationsModule, LookupsModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, PaymentFilesService],
})
export class RegistrationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(uploadLimiter, uploadDailyLimiter).forRoutes({ path: SCREENSHOT_PATH, method: RequestMethod.POST });
  }
}
