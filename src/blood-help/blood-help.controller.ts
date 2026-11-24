import {
  Body,
  Controller,
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
  UseGuards,
} from "@nestjs/common";
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import { roomSubmitLimiter } from "../common/rate-limit/limiters.js";
import type { UserRow } from "../common/session/session.service.js";
import { AdminStatusDto, BloodRequestDto, ConfirmationDto, DonorDto, LangQueryDto, NotifyDonorsDto, RequestListDto } from "./blood-help.dto.js";
import { BLOOD_DONOR_PATH, BLOOD_HELP_ROUTE, BLOOD_NOTIFY_PATH, BLOOD_REQUESTS_PATH } from "./blood-help.routes.js";
import { BloodHelpService } from "./blood-help.service.js";

@ApiTags("Blood Help Network")
@Controller(BLOOD_HELP_ROUTE)
export class BloodHelpController {
  constructor(private readonly service: BloodHelpService) {}

  @Get("summary")
  @ApiOperation({ summary: "Public: registered donors, blood requests, and requests fulfilled (confirmed or admin-verified)" })
  summary() {
    return this.service.summary();
  }

  @Get("me/profile")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "The member's name, mobile and city (read-only, from their records) and their donor details" })
  @ApiForbiddenResponse({ type: ErrorVo, description: "BLOOD_MEMBERS_ONLY: not a registered community member" })
  profile(@CurrentUser() user: UserRow) {
    return this.service.profile(user);
  }

  @Put("me/donor")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Register as a blood donor (or update blood group, last donation date and availability)" })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Missing name / mobile / city, invalid mobile, blood group or date" })
  @ApiForbiddenResponse({ type: ErrorVo })
  saveDonor(@CurrentUser() user: UserRow, @Body() dto: DonorDto) {
    return this.service.saveDonor(user, dto);
  }

  @Get("requests")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "My requests or community requests: filters, sort, pages and both tab counts" })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(@CurrentUser() user: UserRow, @Query() query: RequestListDto) {
    return this.service.list(user, query);
  }

  @Get("requests/recent")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "The latest requests still looking for blood (home page)" })
  recent(@CurrentUser() user: UserRow, @Query() query: LangQueryDto) {
    return this.service.recent(user, query.lang);
  }

  @Post("requests")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Submit a blood request; returns it with the eligible matching donors" })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@CurrentUser() user: UserRow, @Body() dto: BloodRequestDto) {
    return this.service.createRequest(user, dto);
  }

  @Get("requests/:id/suggestions")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Eligible matching donors for one of my requests (WhatsApp links; no numbers listed)" })
  @ApiNotFoundResponse({ type: ErrorVo })
  suggestions(@CurrentUser() user: UserRow, @Param("id") id: string, @Query() query: LangQueryDto) {
    return this.service.suggestions(user, id, query.lang);
  }

  @Post("requests/:id/donor-notifications")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: "Send my request to selected suggested donors (in-app notification)" })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo })
  notify(@CurrentUser() user: UserRow, @Param("id") id: string, @Body() dto: NotifyDonorsDto) {
    return this.service.notifyDonors(user, id, dto);
  }

  @Get("me/confirmations")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My in-progress requests to ask "Did you receive the required blood?" about' })
  pending(@CurrentUser() user: UserRow) {
    return this.service.pendingConfirmations(user);
  }

  @Post("requests/:id/confirmation")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: "Requester: blood received (completed) or not yet (stays in progress)" })
  @ApiNotFoundResponse({ type: ErrorVo })
  confirm(@CurrentUser() user: UserRow, @Param("id") id: string, @Body() dto: ConfirmationDto) {
    return this.service.confirm(user, id, dto.received);
  }

  @Get("admin/requests")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Admin: every blood request with the requester's contact and the audit trail" })
  adminList(@Query() query: RequestListDto) {
    return this.service.adminList(query);
  }

  @Patch("admin/requests/:id/status")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: "Admin: after calling / messaging the requester, mark the request Completed or In Progress" })
  @ApiOkResponse({ description: "The request with its audit trail" })
  @ApiNotFoundResponse({ type: ErrorVo })
  adminStatus(@CurrentUser() user: UserRow, @Param("id") id: string, @Body() dto: AdminStatusDto) {
    return this.service.adminSetStatus(user, id, dto);
  }
}

@Module({ controllers: [BloodHelpController], providers: [BloodHelpService] })
export class BloodHelpModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(roomSubmitLimiter)
      .forRoutes(
        { path: BLOOD_REQUESTS_PATH, method: RequestMethod.POST },
        { path: BLOOD_DONOR_PATH, method: RequestMethod.PUT },
        { path: BLOOD_NOTIFY_PATH, method: RequestMethod.POST },
      );
  }
}
