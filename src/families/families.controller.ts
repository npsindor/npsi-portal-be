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
import { CreateFamilyDto, FamilyListQueryDto, UpdateFamilyDto } from "./dto/families.dto.js";
import { FamiliesService } from "./families.service.js";
import { FamilyVo } from "./vo/families.vo.js";

@ApiTags("families")
@ApiBearerAuth()
@Controller("families")
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List families", description: "Admin only." })
  @ApiOkResponse({ type: FamilyVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(@Query() query: FamilyListQueryDto): Promise<FamilyVo[]> {
    return this.families.list(query);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Create a family", description: "Admin only." })
  @ApiCreatedResponse({ type: FamilyVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() body: CreateFamilyDto): Promise<FamilyVo> {
    return this.families.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a family", description: "Admin only (the member count follows the family's members)." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: FamilyVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateFamilyDto): Promise<FamilyVo> {
    return this.families.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a family", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.families.remove(id);
  }
}
