import { Body, Controller, Delete, Get, Module, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import {
  AdminMrDto,
  AdminRequestDto,
  MrRequestActionDto,
  ReportDto,
  ReportUpdateDto,
  ResourceDto,
  ResourceUpdateDto,
  SehatMrDto,
  SehatRequestDto,
} from "./sehat.dto.js";
import { SehatProviders } from "./sehat.providers.js";
import { SehatService } from "./sehat.service.js";
@ApiTags("Sehat Saathi")
@Controller("sehat-saathi")
export class SehatController {
  constructor(private readonly service: SehatService) {}
  @Get("public")
  @ApiOperation({ summary: "Verified public health resources and consented approved MR contacts only" })
  publicData() {
    return this.service.publicData();
  }
  @Get("me")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  mine(@CurrentUser() user: UserRow) {
    return this.service.mine(user);
  }
  @Post("mrs")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  register(@Body() body: SehatMrDto, @CurrentUser() user: UserRow) {
    return this.service.saveMr(body, user);
  }
  @Post("requests")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  request(@Body() body: SehatRequestDto, @CurrentUser() user: UserRow) {
    return this.service.createRequest(body, user);
  }
  @Patch("requests/:id/close")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  close(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.closeRequest(id, user);
  }
  @Patch("requests/:id/mr-action")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  action(@Param("id") id: string, @Body() body: MrRequestActionDto, @CurrentUser() user: UserRow) {
    return this.service.mrAction(id, body.action, user);
  }
  @Post("reports")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  report(@Body() body: ReportDto, @CurrentUser() user: UserRow) {
    return this.service.report(body, user);
  }
  @Get("admin")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  adminData(@CurrentUser() user: UserRow) {
    return this.service.adminData(user);
  }
  @Patch("admin/mrs/:id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  mrUpdate(@Param("id") id: string, @Body() body: AdminMrDto, @CurrentUser() user: UserRow) {
    return this.service.adminMr(id, body, user);
  }
  @Post("admin/resources")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  resourceCreate(@Body() body: ResourceDto, @CurrentUser() user: UserRow) {
    return this.service.saveResource(body, user);
  }
  @Patch("admin/resources/:id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  resourceUpdate(@Param("id") id: string, @Body() body: ResourceUpdateDto, @CurrentUser() user: UserRow) {
    return this.service.saveResource(body, user, id);
  }
  @Patch("admin/requests/:id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  requestUpdate(@Param("id") id: string, @Body() body: AdminRequestDto, @CurrentUser() user: UserRow) {
    return this.service.adminRequest(id, body, user);
  }
  @Patch("admin/reports/:id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  reportUpdate(@Param("id") id: string, @Body() body: ReportUpdateDto, @CurrentUser() user: UserRow) {
    return this.service.adminReport(id, body, user);
  }
  @Post("admin/notifications/:id/retry")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  retry(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.retryNotice(id, user);
  }
  @Delete("admin/:type/:id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  remove(@Param("type") type: string, @Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.remove(type, id, user);
  }
}
@Module({ controllers: [SehatController], providers: [SehatService, SehatProviders] })
export class SehatModule {}
