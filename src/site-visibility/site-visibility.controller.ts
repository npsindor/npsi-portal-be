import { Body, Controller, Get, Injectable, Module, Put, UseGuards } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, ValidateNested } from "class-validator";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { PrismaService } from "../database/prisma.service.js";

// What an admin may switch off on the public website. The frontend shows the same lists (src/lib/site-visibility.js);
// anything else is refused, so the table only ever holds known keys. The homepage itself can't be switched off.
export const SITE_PAGES = [
  "/about",
  "/events",
  "/news",
  "/sagun",
  "/transportation",
  "/room-hunting",
  "/medical",
  "/community-services",
  "/career-business",
  "/core-team",
  "/register",
  "/student-register",
  "/application-status",
  "/rules",
  "/principles",
  "/help",
  "/contact",
  "/public-feedback",
] as const;
export const HOME_SECTIONS = [
  "counters",
  "services",
  "getStarted",
  "participation",
  "updates",
  "pillars",
  "events",
  "community",
  "showcase",
  "career",
  "gallery",
  "feedback",
] as const;
export const SITE_KEYS = [...SITE_PAGES.map((path) => `page:${path}`), ...HOME_SECTIONS.map((key) => `section:home.${key}`)];

export class SiteVisibilityItemDto {
  @ApiProperty({ example: "page:/room-hunting", description: "page:<path> or section:home.<section>" })
  @IsIn(SITE_KEYS, { message: "Unknown page or section." })
  key!: string;

  @ApiProperty({ example: false }) @IsBoolean() visible!: boolean;
}

export class SiteVisibilityUpdateDto {
  @ApiProperty({ type: SiteVisibilityItemDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SiteVisibilityItemDto)
  items!: SiteVisibilityItemDto[];
}

export class SiteVisibilityVo {
  @ApiProperty({ example: ["page:/transportation", "section:home.gallery"], description: "Keys switched off (everything else is shown)" })
  hidden!: string[];
}

@Injectable()
export class SiteVisibilityService {
  constructor(private readonly db: PrismaService) {}

  async hidden(): Promise<SiteVisibilityVo> {
    const rows = await this.db.siteVisibility.findMany({ where: { visible: false }, select: { key: true }, orderBy: { key: "asc" } });
    return { hidden: rows.map((row) => row.key).filter((key) => SITE_KEYS.includes(key)) };
  }

  async update(input: SiteVisibilityUpdateDto, admin: UserRow): Promise<SiteVisibilityVo> {
    await this.db.$transaction(
      input.items.map((item) =>
        this.db.siteVisibility.upsert({
          where: { key: item.key },
          create: { key: item.key, visible: item.visible, updatedById: admin.id },
          update: { visible: item.visible, updatedById: admin.id },
        }),
      ),
    );
    return this.hidden();
  }
}

@ApiTags("Site visibility")
@Controller("site-visibility")
export class SiteVisibilityController {
  constructor(private readonly service: SiteVisibilityService) {}

  @Get()
  @ApiOperation({ summary: "Public: the pages and homepage sections an admin switched off" })
  @ApiOkResponse({ type: SiteVisibilityVo })
  hidden(): Promise<SiteVisibilityVo> {
    return this.service.hidden();
  }

  @Put()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Admin: switch pages / homepage sections on or off" })
  @ApiOkResponse({ type: SiteVisibilityVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Unknown page or section" })
  @ApiForbiddenResponse({ type: ErrorVo })
  update(@Body() body: SiteVisibilityUpdateDto, @CurrentUser() user: UserRow): Promise<SiteVisibilityVo> {
    return this.service.update(body, user);
  }
}

@Module({ controllers: [SiteVisibilityController], providers: [SiteVisibilityService] })
export class SiteVisibilityModule {}
