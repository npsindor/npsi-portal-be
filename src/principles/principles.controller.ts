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
import { CreatePrincipleDto, PrincipleListQueryDto, UpdatePrincipleDto } from "./dto/principles.dto.js";
import { PrinciplesService } from "./principles.service.js";
import { PrincipleVo } from "./vo/principles.vo.js";

@ApiTags("principles")
@ApiBearerAuth()
@Controller("principles")
export class PrinciplesController {
  constructor(private readonly principles: PrinciplesService) {}

  @Get()
  @ApiOperation({ summary: "List principles", description: "Public." })
  @ApiOkResponse({ type: PrincipleVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  list(@Query() query: PrincipleListQueryDto): Promise<PrincipleVo[]> {
    return this.principles.list(query);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Create a principle", description: "Admin only." })
  @ApiCreatedResponse({ type: PrincipleVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() body: CreatePrincipleDto): Promise<PrincipleVo> {
    return this.principles.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a principle", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: PrincipleVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdatePrincipleDto): Promise<PrincipleVo> {
    return this.principles.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a principle", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.principles.remove(id);
  }
}
