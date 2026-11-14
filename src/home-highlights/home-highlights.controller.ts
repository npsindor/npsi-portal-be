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
import { CreateHomeHighlightDto, HomeHighlightListQueryDto, UpdateHomeHighlightDto } from "./dto/home-highlights.dto.js";
import { HomeHighlightsService } from "./home-highlights.service.js";
import { HomeHighlightVo } from "./vo/home-highlights.vo.js";

@ApiTags("home-highlights")
@ApiBearerAuth()
@Controller("home-highlights")
export class HomeHighlightsController {
  constructor(private readonly highlights: HomeHighlightsService) {}

  @Get()
  @UseGuards(OptionalUserGuard)
  @ApiOperation({ summary: "Homepage highlight slides", description: "Public: active slides inside their date window; admins see all." })
  @ApiOkResponse({ type: HomeHighlightVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Unknown slider" })
  list(@Query() query: HomeHighlightListQueryDto, @OptionalUser() user: UserRow | null): Promise<HomeHighlightVo[]> {
    return this.highlights.list(query, user);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Add a highlight slide (text, image, video or ad)", description: "Admin only." })
  @ApiCreatedResponse({ type: HomeHighlightVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() body: CreateHomeHighlightDto): Promise<HomeHighlightVo> {
    return this.highlights.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Edit, re-order or (de)activate a highlight slide", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: HomeHighlightVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateHomeHighlightDto): Promise<HomeHighlightVo> {
    return this.highlights.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a highlight slide", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.highlights.remove(id);
  }
}
