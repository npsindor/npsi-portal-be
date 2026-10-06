import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { OptionalUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard, OptionalUserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { AnnouncementsService } from "./announcements.service.js";
import { AnnouncementListQueryDto, CreateAnnouncementDto, UpdateAnnouncementDto } from "./dto/announcements.dto.js";
import { AnnouncementVo } from "./vo/announcements.vo.js";

@ApiTags("announcements")
@ApiBearerAuth()
@Controller("announcements")
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @UseGuards(OptionalUserGuard)
  @ApiOperation({ summary: "List announcements", description: "Public: active announcements only; admins see all." })
  @ApiOkResponse({ type: AnnouncementVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  list(@Query() query: AnnouncementListQueryDto, @OptionalUser() user: UserRow | null): Promise<AnnouncementVo[]> {
    return this.announcements.list(query, user);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Create a announcement", description: "Admin only." })
  @ApiCreatedResponse({ type: AnnouncementVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() body: CreateAnnouncementDto): Promise<AnnouncementVo> {
    return this.announcements.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a announcement", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: AnnouncementVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateAnnouncementDto): Promise<AnnouncementVo> {
    return this.announcements.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a announcement", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.announcements.remove(id);
  }
}
