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
import { CommunityPostsService } from "./community-posts.service.js";
import { CommunityPostListQueryDto, CreateCommunityPostDto, UpdateCommunityPostDto } from "./dto/community-posts.dto.js";
import { CommunityPostVo } from "./vo/community-posts.vo.js";

@ApiTags("community-posts")
@ApiBearerAuth()
@Controller("community-posts")
export class CommunityPostsController {
  constructor(private readonly posts: CommunityPostsService) {}

  @Get()
  @UseGuards(OptionalUserGuard)
  @ApiOperation({ summary: "Community Services posts", description: "Public: active posts; admins see all." })
  @ApiOkResponse({ type: CommunityPostVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Unknown section" })
  list(@Query() query: CommunityPostListQueryDto, @OptionalUser() user: UserRow | null): Promise<CommunityPostVo[]> {
    return this.posts.list(query, user);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Add a Community Services post (blood donation, emergency help, social welfare)", description: "Admin only." })
  @ApiCreatedResponse({ type: CommunityPostVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() body: CreateCommunityPostDto): Promise<CommunityPostVo> {
    return this.posts.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Edit, move, re-order or (de)activate a post", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: CommunityPostVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateCommunityPostDto): Promise<CommunityPostVo> {
    return this.posts.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a post", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.posts.remove(id);
  }
}
