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
import { CreateStudentApplicationDto, StudentApplicationListQueryDto, UpdateStudentApplicationDto } from "./dto/student-applications.dto.js";
import { StudentApplicationsService } from "./student-applications.service.js";
import { StudentApplicationVo } from "./vo/student-applications.vo.js";

@ApiTags("student-applications")
@ApiBearerAuth()
@Controller("student-applications")
export class StudentApplicationsController {
  constructor(private readonly studentApplications: StudentApplicationsService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List student applications", description: "Admin only." })
  @ApiOkResponse({ type: StudentApplicationVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(@Query() query: StudentApplicationListQueryDto): Promise<StudentApplicationVo[]> {
    return this.studentApplications.list(query);
  }

  @Post()
  @UseGuards(OptionalUserGuard)
  @ApiOperation({ summary: "Create a student application", description: "Public." })
  @ApiCreatedResponse({ type: StudentApplicationVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  create(@Body() body: CreateStudentApplicationDto, @OptionalUser() user: UserRow | null): Promise<StudentApplicationVo> {
    return this.studentApplications.create(body, user);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a student application", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: StudentApplicationVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateStudentApplicationDto): Promise<StudentApplicationVo> {
    return this.studentApplications.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a student application", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.studentApplications.remove(id);
  }
}
