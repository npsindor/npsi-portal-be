import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Param,
  Patch,
  Post,
  Put,
  Query,
  RequestMethod,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, OptionalUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard, OptionalUserGuard, UserGuard } from "../common/guards/auth.guards.js";
import { roomBrowseLimiter, roomSubmitLimiter } from "../common/rate-limit/limiters.js";
import type { UserRow } from "../common/session/session.service.js";
import { AdminListDto, EnquiryDto, ListingDto, ListingStatusDto, PublicSearchDto, RequirementDto, ReviewDto } from "./room-hunting.dto.js";
import { ROOM_ENQUIRIES_PATH, ROOM_HUNTING_ROUTE, ROOM_LISTINGS_PATH, ROOM_REQUIREMENTS_PATH } from "./room-hunting.routes.js";
import { RoomHuntingService } from "./room-hunting.service.js";

@ApiTags("Room Hunting")
@Controller(ROOM_HUNTING_ROUTE)
export class RoomHuntingController {
  constructor(private readonly service: RoomHuntingService) {}

  @Get("options")
  @ApiOperation({ summary: "Property types and areas for the pickers (built-in plus admin-managed)" })
  options() {
    return this.service.options();
  }

  @Get("listings")
  @ApiOperation({ summary: "Public: approved, unexpired rental listings; contacts only as each owner chose" })
  listings(@Query() query: PublicSearchDto) {
    return this.service.publicListings(query);
  }

  @Get("requirements")
  @ApiOperation({ summary: "Public: approved, unexpired room requirements; names shortened, contacts only with consent" })
  requirements(@Query() query: PublicSearchDto) {
    return this.service.publicRequirements(query);
  }

  @Post("requirements")
  @UseGuards(OptionalUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Post a room requirement (anyone; anonymous ones need reCAPTCHA and admin approval) and get matching listings" })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiConflictResponse({ type: ErrorVo, description: "An open requirement for the same mobile, type and area exists" })
  createRequirement(@Body() dto: RequirementDto, @OptionalUser() user: UserRow | null) {
    return this.service.createRequirement(dto, user);
  }

  @Patch("requirements/:id/closure")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Close your own requirement" })
  @ApiNotFoundResponse({ type: ErrorVo })
  close(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.closeRequirement(id, user);
  }

  @Get("me")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Own listings (with matches and enquiries), own requirements (with matching listings) and sent enquiries" })
  mine(@CurrentUser() user: UserRow) {
    return this.service.mine(user);
  }

  @Post("listings")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add a rental listing (approved family members and registered students); it is reviewed before it is public" })
  @ApiForbiddenResponse({ type: ErrorVo, description: "ROOM_MEMBERSHIP_REQUIRED" })
  @ApiConflictResponse({ type: ErrorVo, description: "ROOM_DUPLICATE_LISTING" })
  createListing(@Body() dto: ListingDto, @CurrentUser() user: UserRow) {
    return this.service.createListing(dto, user);
  }

  @Put("listings/:id")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit your own listing (it is reviewed again)" })
  @ApiNotFoundResponse({ type: ErrorVo })
  updateListing(@Param("id") id: string, @Body() dto: ListingDto, @CurrentUser() user: UserRow) {
    return this.service.updateListing(id, dto, user);
  }

  @Patch("listings/:id/status")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Mark your listing rented / inactive, or re-list it" })
  @ApiConflictResponse({ type: ErrorVo, description: "ROOM_STATE" })
  listingStatus(@Param("id") id: string, @Body() dto: ListingStatusDto, @CurrentUser() user: UserRow) {
    return this.service.setListingStatus(id, dto.status, user);
  }

  @Delete("listings/:id")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete (archive) your own listing" })
  @ApiOkResponse({ description: "{ ok: true }" })
  removeListing(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.removeListing(id, user);
  }

  @Post("listings/:id/enquiries")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Send an enquiry to a listing's owner (shares your name and registered mobile with them)" })
  @ApiConflictResponse({ type: ErrorVo, description: "ROOM_ENQUIRY_EXISTS" })
  enquire(@Param("id") id: string, @Body() dto: EnquiryDto, @CurrentUser() user: UserRow) {
    return this.service.enquire(id, dto, user);
  }

  @Get("admin/stats")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Admin: counts by status" })
  stats() {
    return this.service.adminStats();
  }

  @Get("admin/listings")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Admin: all listings with full contact details" })
  adminListings(@Query() query: AdminListDto) {
    return this.service.adminListings(query);
  }

  @Get("admin/requirements")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Admin: all requirements with full contact details" })
  adminRequirements(@Query() query: AdminListDto) {
    return this.service.adminRequirements(query);
  }

  @Get("admin/matches")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Admin: matching history" })
  adminMatches() {
    return this.service.adminMatches();
  }

  @Get("admin/audit-logs")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Admin: audit log (optionally for one listing/requirement)" })
  audit(@Query("entityId") entityId?: string) {
    return this.service.adminAudit(entityId);
  }

  @Patch("admin/listings/:id/review")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: "Admin: approve, reject (remarks required), deactivate, expire, archive or restore a listing" })
  reviewListing(@Param("id") id: string, @Body() dto: ReviewDto, @CurrentUser() user: UserRow) {
    return this.service.reviewListing(id, dto, user);
  }

  @Patch("admin/requirements/:id/review")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: "Admin: approve, reject (remarks required), close, expire, archive or restore a requirement" })
  reviewRequirement(@Param("id") id: string, @Body() dto: ReviewDto, @CurrentUser() user: UserRow) {
    return this.service.reviewRequirement(id, dto, user);
  }
}

@Module({ controllers: [RoomHuntingController], providers: [RoomHuntingService] })
export class RoomHuntingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(roomSubmitLimiter)
      .forRoutes(
        { path: ROOM_REQUIREMENTS_PATH, method: RequestMethod.POST },
        { path: ROOM_LISTINGS_PATH, method: RequestMethod.POST },
        { path: ROOM_ENQUIRIES_PATH, method: RequestMethod.POST },
      );
    consumer
      .apply(roomBrowseLimiter)
      .forRoutes({ path: ROOM_LISTINGS_PATH, method: RequestMethod.GET }, { path: ROOM_REQUIREMENTS_PATH, method: RequestMethod.GET });
  }
}
