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
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard } from "../common/guards/auth.guards.js";
import { CreateSamitiMemberDto, SamitiMemberListQueryDto, UpdateSamitiMemberDto } from "./dto/samiti-members.dto.js";
import { SamitiMembersService } from "./samiti-members.service.js";
import { SamitiMemberVo } from "./vo/samiti-members.vo.js";

@ApiTags("samiti-members")
@ApiBearerAuth()
@Controller("samiti-members")
export class SamitiMembersController {
  constructor(private readonly samitiMembers: SamitiMembersService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List samiti members", description: "Admin only." })
  @ApiOkResponse({ type: SamitiMemberVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(@Query() query: SamitiMemberListQueryDto): Promise<SamitiMemberVo[]> {
    return this.samitiMembers.list(query);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Create a samiti member", description: "Admin only." })
  @ApiCreatedResponse({ type: SamitiMemberVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() body: CreateSamitiMemberDto): Promise<SamitiMemberVo> {
    return this.samitiMembers.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a samiti member", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: SamitiMemberVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateSamitiMemberDto): Promise<SamitiMemberVo> {
    return this.samitiMembers.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a samiti member", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.samitiMembers.remove(id);
  }
}
