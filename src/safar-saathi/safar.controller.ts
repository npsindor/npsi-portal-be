import { Body, Controller, Get, Module, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { CreateSafarDto, SafarAdminQueryDto, SafarAdminUpdateDto, SafarAvailableQueryDto, SafarConnectDto, SafarDecisionDto } from "./safar.dto.js";
import { SafarService } from "./safar.service.js";

@ApiTags("Travel & Assistance")
@Controller("safar-saathi")
export class SafarController {
  constructor(private readonly service: SafarService) {}
  @Get("capabilities")
  @ApiOperation({ summary: "Available notification channels; no personal data" })
  capabilities() {
    return this.service.capabilities();
  }
  @Get("me")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Own travel requests, matches and private notifications" })
  mine(@CurrentUser() user: UserRow) {
    return this.service.mine(user);
  }
  @Post("entries")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a member travel request or willing-to-help travel plan and find matches" })
  create(@Body() body: CreateSafarDto, @CurrentUser() user: UserRow) {
    return this.service.create(body, user);
  }
  @Get("available")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Available Journeys & Requests: other members' open upcoming entries, no names or contacts; optional route/date/time" })
  available(@Query() query: SafarAvailableQueryDto, @CurrentUser() user: UserRow) {
    return this.service.available(user, query);
  }
  @Post("entries/:id/connections")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Direct request to another member's entry (parcel, travelling together, or an offer to help); idempotent" })
  connect(@Param("id") id: string, @Body() body: SafarConnectDto, @CurrentUser() user: UserRow) {
    return this.service.connect(id, body, user);
  }
  @Patch("entries/:id/cancellation")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Cancel only your own entry and its active matches" })
  cancel(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.cancel(id, user);
  }
  @Patch("matches/:id")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Accept, decline or complete your own match; contacts require mutual acceptance" })
  decide(@Param("id") id: string, @Body() body: SafarDecisionDto, @CurrentUser() user: UserRow) {
    return this.service.decide(id, body.decision, user);
  }
  @Get("admin/entries")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Admin: all Travel & Assistance requests and offers, filtered by status/kind/search" })
  adminEntries(@Query() query: SafarAdminQueryDto) {
    return this.service.adminEntries(query);
  }
  @Patch("admin/entries/:id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Admin: set a request's status with remarks (the member is notified)" })
  adminUpdate(@Param("id") id: string, @Body() body: SafarAdminUpdateDto, @CurrentUser() user: UserRow) {
    return this.service.adminUpdate(id, body, user);
  }
}
@Module({ controllers: [SafarController], providers: [SafarService] })
export class SafarModule {}
