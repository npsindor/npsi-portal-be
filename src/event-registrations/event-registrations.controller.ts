import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { CreateEventRegistrationDto, EventRegistrationListQueryDto, UpdateEventRegistrationDto } from "./dto/event-registrations.dto.js";
import { EventRegistrationsService } from "./event-registrations.service.js";
import { EventRegistrationVo } from "./vo/event-registrations.vo.js";

@ApiTags("event-registrations")
@ApiBearerAuth()
@Controller("event-registrations")
export class EventRegistrationsController {
  constructor(private readonly eventRegistrations: EventRegistrationsService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List event registrations", description: "Admin only." })
  @ApiOkResponse({ type: EventRegistrationVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(@Query() query: EventRegistrationListQueryDto): Promise<EventRegistrationVo[]> {
    return this.eventRegistrations.list(query);
  }

  @Post()
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "Create a event registration", description: "Any logged-in user." })
  @ApiCreatedResponse({ type: EventRegistrationVo })
  @ApiConflictResponse({ type: ErrorVo, description: "The family is already registered for this event" })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  create(@Body() body: CreateEventRegistrationDto, @CurrentUser() user: UserRow): Promise<EventRegistrationVo> {
    return this.eventRegistrations.create(body, user);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a event registration", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: EventRegistrationVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateEventRegistrationDto): Promise<EventRegistrationVo> {
    return this.eventRegistrations.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a event registration", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.eventRegistrations.remove(id);
  }
}
