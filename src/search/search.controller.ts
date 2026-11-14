import { Controller, Get, type MiddlewareConsumer, Module, type NestModule, Query, RequestMethod, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { OptionalUser } from "../common/decorators/current-user.decorator.js";
import { OptionalUserGuard } from "../common/guards/auth.guards.js";
import { searchLimiter } from "../common/rate-limit/limiters.js";
import type { UserRow } from "../common/session/session.service.js";
import { SearchService } from "./search.service.js";

export class SearchQueryDto {
  @ApiPropertyOptional({ description: "At least 2 characters" }) @IsOptional() @IsString() @MaxLength(100) q?: string;
}

@ApiTags("Search")
@Controller("search")
export class SearchController {
  constructor(private readonly service: SearchService) {}
  @Get()
  @UseGuards(OptionalUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Portal-wide search: public content for everyone, own family for members, families/members/students for admins" })
  search(@Query() query: SearchQueryDto, @OptionalUser() user: UserRow | null) {
    return this.service.search(query.q ?? "", user);
  }
}

@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(searchLimiter).forRoutes({ path: "search", method: RequestMethod.GET });
  }
}
