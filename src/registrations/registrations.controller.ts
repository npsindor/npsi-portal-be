import {
  Body,
  Controller,
  Get,
  HttpCode,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Param,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { ApplicationsModule } from "../applications/applications.module.js";
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
import { PaymentReviewDto, RegistrationDto, RegistrationPaymentsQueryDto } from "./dto/registrations.dto.js";
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
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Registration-fee payments with applicant details — admin only" })
  @ApiOkResponse({ description: "Payments, newest first" })
  @ApiForbiddenResponse({ type: ErrorVo })
  payments(@Query() query: RegistrationPaymentsQueryDto) {
    return this.service.payments(query);
  }

  @Post("registration-payments/:id/review")
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Verify, reject (with remarks) or refund (with remarks) a registration payment; the applicant is notified — admin only" })
  @ApiOkResponse({ type: TransactionVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Remarks missing" })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiConflictResponse({ type: ErrorVo, description: "Not allowed from the current payment status" })
  @ApiForbiddenResponse({ type: ErrorVo })
  review(@Param("id") id: string, @Body() dto: PaymentReviewDto, @CurrentUser() user: UserRow) {
    return this.service.reviewPayment(id, dto, user);
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
