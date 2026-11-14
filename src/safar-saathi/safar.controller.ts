import { Body, Controller, Get, Module, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { UserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { CreateSafarDto, SafarDecisionDto } from "./safar.dto.js";
import { SafarService } from "./safar.service.js";

@ApiTags("Safar Saathi")
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
}
@Module({ controllers: [SafarController], providers: [SafarService] })
export class SafarModule {}
