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
import { CreatePageBlockDto, PageBlockListQueryDto, UpdatePageBlockDto } from "./dto/page-blocks.dto.js";
import { PageBlocksService } from "./page-blocks.service.js";
import { PageBlockVo } from "./vo/page-blocks.vo.js";

@ApiTags("page-blocks")
@ApiBearerAuth()
@Controller("page-blocks")
export class PageBlocksController {
  constructor(private readonly blocks: PageBlocksService) {}

  @Get()
  @UseGuards(OptionalUserGuard)
  @ApiOperation({ summary: "Content blocks of the public menu pages", description: "Public: active blocks; admins see all." })
  @ApiOkResponse({ type: PageBlockVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Unknown page" })
  list(@Query() query: PageBlockListQueryDto, @OptionalUser() user: UserRow | null): Promise<PageBlockVo[]> {
    return this.blocks.list(query, user);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Add page content: a section intro or an entry (text, image, video, button)", description: "Admin only." })
  @ApiCreatedResponse({ type: PageBlockVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() body: CreatePageBlockDto): Promise<PageBlockVo> {
    return this.blocks.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Edit, move, re-order or (de)activate a content block", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: PageBlockVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdatePageBlockDto): Promise<PageBlockVo> {
    return this.blocks.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a content block", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.blocks.remove(id);
  }
}
