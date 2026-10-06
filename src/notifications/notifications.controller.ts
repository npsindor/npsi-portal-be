import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import type { Response } from "express";
import { CurrentUser, OptionalUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard, OptionalUserGuard, UserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { CreateNotificationDto, NotificationBatchDto, NotificationListQueryDto, UpdateNotificationDto } from "./dto/notification.dto.js";
import { NotificationsService } from "./notifications.service.js";
import { NotificationVo } from "./vo/notification.vo.js";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "List notifications", description: "Admins see all; members see their family's and broadcast ones." })
  @ApiOkResponse({ type: NotificationVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order or limit" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  list(@CurrentUser() user: UserRow, @Query() query: NotificationListQueryDto): Promise<NotificationVo[]> {
    return this.notifications.list(user, query);
  }

  @Post()
  @UseGuards(OptionalUserGuard)
  @ApiOperation({
    summary: "Send a notification",
    description:
      "Admins: to anyone (blank recipient = everyone). Members: to their own family, or to a family they just requested a transfer to. " +
      "Anyone: the one notice for an application submitted in the last 15 minutes.",
  })
  @ApiCreatedResponse({ type: NotificationVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Title, message or type missing, or a field contains < or >" })
  @ApiForbiddenResponse({ type: ErrorVo, description: "Not allowed to notify this recipient" })
  @ApiConflictResponse({ type: ErrorVo, description: "This application has already been notified" })
  create(@Body() body: CreateNotificationDto, @OptionalUser() user: UserRow | null): Promise<NotificationVo> {
    return this.notifications.create(body, user);
  }

  @Post("batch")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Send several notifications at once", description: "Admin only. All or nothing. Returns 200 with [] when no records are sent." })
  @ApiCreatedResponse({ type: NotificationVo, isArray: true })
  @ApiOkResponse({ type: NotificationVo, isArray: true, description: "Nothing to create" })
  @ApiBadRequestResponse({ type: ErrorVo, description: "A record is invalid (nothing is created)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  async createBatch(@Body() body: NotificationBatchDto, @Res({ passthrough: true }) response: Response): Promise<NotificationVo[]> {
    const result = await this.notifications.createBatch(body.records);
    response.status(result.status);
    return result.records;
  }

  @Patch(":id")
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "Update a notification", description: "Admins: any field. Members: only `read`, on their own or broadcast notifications." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: NotificationVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid field value" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateNotificationDto, @CurrentUser() user: UserRow): Promise<NotificationVo> {
    return this.notifications.update(id, body, user);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a notification", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.notifications.remove(id);
  }
}
