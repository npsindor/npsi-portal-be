import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
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
import type { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { CreateFamilyMemberDto, FamilyMemberBatchDto, FamilyMemberListQueryDto, UpdateFamilyMemberDto } from "./dto/family-members.dto.js";
import { FamilyMembersService } from "./family-members.service.js";
import { FamilyMemberVo } from "./vo/family-members.vo.js";

@ApiTags("family-members")
@ApiBearerAuth()
@Controller("family-members")
export class FamilyMembersController {
  constructor(private readonly familyMembers: FamilyMembersService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List family members", description: "Admin only." })
  @ApiOkResponse({ type: FamilyMemberVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(@Query() query: FamilyMemberListQueryDto): Promise<FamilyMemberVo[]> {
    return this.familyMembers.list(query);
  }

  @Post()
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "Create a family member", description: "Any logged-in user." })
  @ApiCreatedResponse({ type: FamilyMemberVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  create(@Body() body: CreateFamilyMemberDto, @CurrentUser() user: UserRow): Promise<FamilyMemberVo> {
    return this.familyMembers.create(body, user);
  }

  @Post("batch")
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: "Create several family members at once",
    description: "Admin only. All or nothing; consecutive membership ids. 200 with [] when no records are sent.",
  })
  @ApiCreatedResponse({ type: FamilyMemberVo, isArray: true })
  @ApiOkResponse({ type: FamilyMemberVo, isArray: true, description: "Nothing to create" })
  @ApiBadRequestResponse({ type: ErrorVo, description: "A record is invalid (nothing is created)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  async createBatch(@Body() body: FamilyMemberBatchDto, @Res({ passthrough: true }) response: Response): Promise<FamilyMemberVo[]> {
    const result = await this.familyMembers.createBatch(body.records);
    response.status(result.status);
    return result.records;
  }

  @Patch(":id")
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "Update a family member", description: "Any logged-in user." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: FamilyMemberVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateFamilyMemberDto, @CurrentUser() user: UserRow): Promise<FamilyMemberVo> {
    return this.familyMembers.update(id, body, user);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "Delete a family member", description: "Any logged-in user." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  remove(@Param("id") id: string, @CurrentUser() user: UserRow): Promise<void> {
    return this.familyMembers.remove(id, user);
  }
}
