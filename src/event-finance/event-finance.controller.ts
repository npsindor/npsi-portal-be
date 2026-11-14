import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import {
  EventContributionDto,
  EventExpenseDto,
  EventResponsibilityDto,
  EventRosterDto,
  EventTeamDto,
  ExpenseCategoryDto,
  RosterImportDto,
} from "./event-finance.dto.js";
import { EventFinanceService } from "./event-finance.service.js";

@Controller("event-finance")
export class EventFinanceController {
  constructor(private readonly finance: EventFinanceService) {}

  @Get()
  @UseGuards(UserGuard)
  list(@CurrentUser() user: UserRow) {
    return this.finance.list(user);
  }

  @Get("members")
  @UseGuards(AdminGuard)
  members(@Query("q") q = "") {
    return this.finance.availableMembers(q);
  }

  // Keep this static path before :eventId so Express does not treat "admin" as an event ID.
  @Get("admin/categories")
  @UseGuards(AdminGuard)
  categories() {
    return this.finance.categories();
  }

  @Get(":eventId")
  @UseGuards(UserGuard)
  detail(@Param("eventId") eventId: string, @CurrentUser() user: UserRow) {
    return this.finance.detail(eventId, user);
  }

  @Post("admin/categories")
  @UseGuards(AdminGuard)
  createCategory(@Body() body: ExpenseCategoryDto) {
    return this.finance.saveCategory(body);
  }

  @Patch("admin/categories/:id")
  @UseGuards(AdminGuard)
  updateCategory(@Param("id") id: string, @Body() body: ExpenseCategoryDto) {
    return this.finance.saveCategory(body, id);
  }

  @Delete("admin/categories/:id")
  @UseGuards(AdminGuard)
  deleteCategory(@Param("id") id: string) {
    return this.finance.deactivateCategory(id);
  }

  @Post("admin/events/:eventId/contributions")
  @UseGuards(AdminGuard)
  createContribution(@Param("eventId") eventId: string, @Body() body: EventContributionDto, @CurrentUser() user: UserRow) {
    return this.finance.saveContribution(eventId, body, user);
  }

  @Patch("admin/events/:eventId/contributions/:id")
  @UseGuards(AdminGuard)
  updateContribution(@Param("eventId") eventId: string, @Param("id") id: string, @Body() body: EventContributionDto, @CurrentUser() user: UserRow) {
    return this.finance.saveContribution(eventId, body, user, id);
  }

  @Patch("admin/events/:eventId/contributions/:id/review")
  @UseGuards(AdminGuard)
  reviewContribution(@Param("eventId") eventId: string, @Param("id") id: string, @Body("status") status: string, @CurrentUser() user: UserRow) {
    return this.finance.reviewContribution(eventId, id, status, user);
  }

  @Delete("admin/events/:eventId/contributions/:id")
  @UseGuards(AdminGuard)
  deleteContribution(@Param("eventId") eventId: string, @Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.finance.deleteContribution(eventId, id, user);
  }

  @Post("admin/events/:eventId/expenses")
  @UseGuards(AdminGuard)
  createExpense(@Param("eventId") eventId: string, @Body() body: EventExpenseDto, @CurrentUser() user: UserRow) {
    return this.finance.saveExpense(eventId, body, user);
  }

  @Patch("admin/events/:eventId/expenses/:id")
  @UseGuards(AdminGuard)
  updateExpense(@Param("eventId") eventId: string, @Param("id") id: string, @Body() body: EventExpenseDto, @CurrentUser() user: UserRow) {
    return this.finance.saveExpense(eventId, body, user, id);
  }

  @Patch("admin/events/:eventId/expenses/:id/review")
  @UseGuards(AdminGuard)
  reviewExpense(@Param("eventId") eventId: string, @Param("id") id: string, @Body("status") status: string, @CurrentUser() user: UserRow) {
    return this.finance.reviewExpense(eventId, id, status, user);
  }

  @Delete("admin/events/:eventId/expenses/:id")
  @UseGuards(AdminGuard)
  deleteExpense(@Param("eventId") eventId: string, @Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.finance.deleteExpense(eventId, id, user);
  }

  @Get("admin/events/:eventId/roster")
  @UseGuards(AdminGuard)
  roster(@Param("eventId") eventId: string) {
    return this.finance.roster(eventId);
  }

  @Post("admin/events/:eventId/roster")
  @UseGuards(AdminGuard)
  createRoster(@Param("eventId") eventId: string, @Body() body: EventRosterDto, @CurrentUser() user: UserRow) {
    return this.finance.saveRoster(eventId, body, user);
  }

  @Patch("admin/events/:eventId/roster/:id")
  @UseGuards(AdminGuard)
  updateRoster(@Param("eventId") eventId: string, @Param("id") id: string, @Body() body: EventRosterDto, @CurrentUser() user: UserRow) {
    return this.finance.saveRoster(eventId, body, user, id);
  }

  @Delete("admin/events/:eventId/roster/:id")
  @UseGuards(AdminGuard)
  deleteRoster(@Param("eventId") eventId: string, @Param("id") id: string, @CurrentUser() user: UserRow) {
    return this.finance.deleteRoster(eventId, id, user);
  }

  @Post("admin/events/:eventId/roster/import")
  @UseGuards(AdminGuard)
  importRoster(@Param("eventId") eventId: string, @Body() body: RosterImportDto, @CurrentUser() user: UserRow) {
    return this.finance.importRoster(eventId, body, user);
  }

  @Post("admin/events/:eventId/teams")
  @UseGuards(AdminGuard)
  createTeam(@Param("eventId") eventId: string, @Body() body: EventTeamDto, @CurrentUser() user: UserRow) {
    return this.finance.saveTeam(eventId, body, user);
  }

  @Patch("admin/events/:eventId/teams/:id")
  @UseGuards(AdminGuard)
  updateTeam(@Param("eventId") eventId: string, @Param("id") id: string, @Body() body: EventTeamDto, @CurrentUser() user: UserRow) {
    return this.finance.saveTeam(eventId, body, user, id);
  }

  @Delete("admin/events/:eventId/teams/:id")
  @UseGuards(AdminGuard)
  deleteTeam(@Param("eventId") eventId: string, @Param("id") id: string) {
    return this.finance.deactivateTeam(eventId, id);
  }

  @Post("admin/events/:eventId/responsibilities")
  @UseGuards(AdminGuard)
  createResponsibility(@Param("eventId") eventId: string, @Body() body: EventResponsibilityDto, @CurrentUser() user: UserRow) {
    return this.finance.saveResponsibility(eventId, body, user);
  }

  @Patch("admin/events/:eventId/responsibilities/:id")
  @UseGuards(AdminGuard)
  updateResponsibility(@Param("eventId") eventId: string, @Param("id") id: string, @Body() body: EventResponsibilityDto, @CurrentUser() user: UserRow) {
    return this.finance.saveResponsibility(eventId, body, user, id);
  }
}
