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
import { CreateRuleDto, RuleListQueryDto, UpdateRuleDto } from "./dto/rules.dto.js";
import { RulesService } from "./rules.service.js";
import { RuleVo } from "./vo/rules.vo.js";

@ApiTags("rules")
@ApiBearerAuth()
@Controller("rules")
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  @ApiOperation({ summary: "List rules", description: "Public." })
  @ApiOkResponse({ type: RuleVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  list(@Query() query: RuleListQueryDto): Promise<RuleVo[]> {
    return this.rules.list(query);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Create a rule", description: "Admin only." })
  @ApiCreatedResponse({ type: RuleVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() body: CreateRuleDto): Promise<RuleVo> {
    return this.rules.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a rule", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: RuleVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateRuleDto): Promise<RuleVo> {
    return this.rules.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a rule", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.rules.remove(id);
  }
}
