import {
  Body,
  Controller,
  Get,
  HttpCode,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Param,
  Patch,
  Post,
  Query,
  RequestMethod,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, OptionalUser } from "../common/decorators/current-user.decorator.js";
import { AdminGuard, OptionalUserGuard, UserGuard } from "../common/guards/auth.guards.js";
import { roomSubmitLimiter } from "../common/rate-limit/limiters.js";
import type { UserRow } from "../common/session/session.service.js";
import { EventMemberApplyDto, EventMemberRemoveDto, EventMemberReviewDto, EventMemberSectionDto, EventMemberUpdateDto } from "./event-members.dto.js";
import { EventMembersService } from "./event-members.service.js";

@ApiTags("Become an NPSI Event Member")
@Controller("event-member-sections")
export class EventMemberSectionsController {
  constructor(private readonly service: EventMembersService) {}

  @Get()
  @ApiOperation({ summary: "Teams open for applications (the Become a Member dropdown; OTHER is added by the form)" })
  @ApiResponse({ status: 200, description: "Section keys, labels and public headings" })
  open() {
    return this.service.openSections();
  }

  @Get("admin")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "All sections with their event link and approved / pending counts — admin only" })
  @ApiResponse({ status: 200, description: "Sections and counts" })
  adminList(@CurrentUser() user: UserRow) {
    return this.service.adminSections(user);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add a team section (e.g. for an OTHER request) — admin only" })
  @ApiResponse({ status: 201, description: "Created" })
  @ApiResponse({ status: 400, description: "Label and heading are required, or unknown event" })
  create(@Body() dto: EventMemberSectionDto, @CurrentUser() user: UserRow) {
    return this.service.saveSection(dto, user);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit a section: labels, heading, event page, open for applications, active — admin only" })
  @ApiResponse({ status: 200, description: "Updated" })
  @ApiResponse({ status: 404, description: "Not found" })
  update(@Param("id") id: string, @Body() dto: EventMemberSectionDto, @CurrentUser() user: UserRow) {
    return this.service.saveSection(dto, user, id);
  }
}

@ApiTags("Become an NPSI Event Member")
@Controller("event-members")
export class EventMembersPublicController {
  constructor(private readonly service: EventMembersService) {}

  @Get("teams")
  @ApiOperation({ summary: "Public team cards: one section (?section=CORE_TEAM) or every section on an event page (?event=slug)" })
  @ApiQuery({ name: "section", required: false })
  @ApiQuery({ name: "event", required: false })
  @ApiResponse({ status: 200, description: "Event (if any) and sections with approved, visible members; mobile/email only with consent" })
  @ApiResponse({ status: 404, description: "Unknown section or unpublished event" })
  teams(@Query("section") section?: string, @Query("event") event?: string) {
    return this.service.teams({ section, event });
  }
}

@ApiTags("Become an NPSI Event Member")
@Controller("event-member-applications")
export class EventMemberApplicationsController {
  constructor(private readonly service: EventMembersService) {}

  @Post()
  @UseGuards(OptionalUserGuard)
  @ApiOperation({ summary: "Submit a Become a Member request (public with reCAPTCHA; logged in: may use an own family member / student record)" })
  @ApiResponse({ status: 201, description: "Saved as PENDING" })
  @ApiResponse({ status: 400, description: "Validation, reCAPTCHA or photo error (EM_* codes)" })
  @ApiResponse({ status: 403, description: "The chosen record is not one of this account's own people" })
  @ApiResponse({ status: 409, description: "An open application for this person and team already exists" })
  apply(@Body() dto: EventMemberApplyDto, @OptionalUser() user: UserRow | null) {
    return this.service.apply(dto, user);
  }

  @Get("candidates")
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "This account's own people with their details for autofill, and its applications" })
  @ApiResponse({ status: 200, description: "Candidates and own applications" })
  candidates(@CurrentUser() user: UserRow) {
    return this.service.candidates(user);
  }

  @Post(":id/withdrawal")
  @HttpCode(200)
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Withdraw an own pending application (kept in history)" })
  @ApiResponse({ status: 200, description: "Withdrawn" })
  @ApiResponse({ status: 404, description: "Not among this account's applications" })
  @ApiResponse({ status: 409, description: "No longer pending" })
  withdraw(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.withdraw(id, user);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "All applications — admin only" })
  @ApiResponse({ status: 200, description: "Applications with section" })
  list(@CurrentUser() user: UserRow) {
    return this.service.list(user);
  }

  @Get("people")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Search existing members and students to apply on their behalf — admin only" })
  @ApiQuery({ name: "q", required: true })
  @ApiResponse({ status: 200, description: "Matching people" })
  people(@Query("q") q: string, @CurrentUser() user: UserRow) {
    return this.service.people(q ?? "", user);
  }

  @Get(":id/history")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Application history — admin only" })
  @ApiResponse({ status: 200, description: "Log entries, oldest first" })
  @ApiResponse({ status: 404, description: "Not found" })
  history(@Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.service.history(id, user);
  }

  @Post(":id/review")
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Approve (shows the card in its section, syncs the event roster) or reject with a reason — admin only" })
  @ApiResponse({ status: 200, description: "Updated application" })
  @ApiResponse({ status: 400, description: "Reason missing, or OTHER request without a section" })
  @ApiResponse({ status: 409, description: "The person already has an open application in that section" })
  review(@Param("id") id: string, @Body() dto: EventMemberReviewDto, @CurrentUser() user: UserRow) {
    return this.service.review(id, dto, user);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit public details, section, visibility; mobile/email can only be hidden — admin only" })
  @ApiResponse({ status: 200, description: "Updated application" })
  @ApiResponse({ status: 400, description: "Tried to publish a mobile/email without the member's consent, or bad photo" })
  update(@Param("id") id: string, @Body() dto: EventMemberUpdateDto, @CurrentUser() user: UserRow) {
    return this.service.update(id, dto, user);
  }

  @Post(":id/removal")
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "End the event membership (the person's account and records stay) — admin only" })
  @ApiResponse({ status: 200, description: "Removed" })
  remove(@Param("id") id: string, @Body() dto: EventMemberRemoveDto, @CurrentUser() user: UserRow) {
    return this.service.remove(id, dto, user);
  }
}

@Module({
  controllers: [EventMemberSectionsController, EventMembersPublicController, EventMemberApplicationsController],
  providers: [EventMembersService],
})
export class EventMembersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(roomSubmitLimiter).forRoutes({ path: "event-member-applications", method: RequestMethod.POST });
  }
}
