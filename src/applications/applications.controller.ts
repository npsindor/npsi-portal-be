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
import { ApplicationsService } from "./applications.service.js";
import { ApplicationListQueryDto, CreateApplicationDto, UpdateApplicationDto } from "./dto/applications.dto.js";
import { ApplicationVo } from "./vo/applications.vo.js";

@ApiTags("applications")
@ApiBearerAuth()
@Controller("applications")
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List applications", description: "Admin only." })
  @ApiOkResponse({ type: ApplicationVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(@Query() query: ApplicationListQueryDto): Promise<ApplicationVo[]> {
    return this.applications.list(query);
  }

  @Post()
  @UseGuards(OptionalUserGuard)
  @ApiOperation({ summary: "Create a application", description: "Public." })
  @ApiCreatedResponse({ type: ApplicationVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  create(@Body() body: CreateApplicationDto, @OptionalUser() user: UserRow | null): Promise<ApplicationVo> {
    return this.applications.create(body, user);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a application", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: ApplicationVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateApplicationDto): Promise<ApplicationVo> {
    return this.applications.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a application", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.applications.remove(id);
  }
}
