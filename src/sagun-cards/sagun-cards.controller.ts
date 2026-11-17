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
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { AdminGuard } from "../common/guards/auth.guards.js";
import { publicLookupLimiter } from "../common/rate-limit/limiters.js";
import type { UserRow } from "../common/session/session.service.js";
import { SagunBookletDto, SagunCardListDto, SagunCardSelectionDto } from "./sagun-cards.dto.js";
import { SagunCardsService } from "./sagun-cards.service.js";

const sendPdf = (response: Response, pdf: Buffer, filename: string, download = false) =>
  response
    .set({
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    })
    .send(pdf);

@ApiTags("Shagun Digital Cards")
@Controller("sagun-cards")
export class SagunCardsController {
  constructor(private readonly service: SagunCardsService) {}

  @Get("stats")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Counts for the Shagun Digital Cards overview (admin)" })
  @ApiResponse({ status: 200, description: "Counts by category, state, booklet selection and booklets generated" })
  @ApiResponse({ status: 403, description: "Admin access required" })
  stats(@CurrentUser() user: UserRow) {
    return this.service.stats(user);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Digital cards of submitted Shagun profiles, with the details printed on each card (admin)" })
  @ApiResponse({ status: 200, description: "Cards" })
  @ApiResponse({ status: 403, description: "Admin access required" })
  list(@Query() query: SagunCardListDto, @CurrentUser() user: UserRow) {
    return this.service.list(query, user);
  }

  @Patch("selection")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Select or deselect cards for the printed booklet (admin)" })
  @ApiResponse({ status: 200, description: "Updated" })
  @ApiResponse({ status: 404, description: "Unknown profile" })
  @ApiResponse({ status: 409, description: "A card may not be printed (not approved, private, consent missing or no photo)" })
  select(@Body() dto: SagunCardSelectionDto, @CurrentUser() user: UserRow) {
    return this.service.select(dto, user);
  }

  @Get("verifications/:token")
  @ApiOperation({ summary: "Public QR check: is this printed card genuine and active?" })
  @ApiResponse({ status: 200, description: "Card status; name and category only while the profile is active" })
  @ApiResponse({ status: 404, description: "Unknown card" })
  verify(@Param("token") token: string) {
    return this.service.verify(token);
  }

  @Get(":profileId/pdf")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiProduces("application/pdf")
  @ApiOperation({ summary: "One digital card as a PDF (preview / print, admin)" })
  @ApiResponse({ status: 200, description: "PDF" })
  @ApiResponse({ status: 404, description: "Unknown profile" })
  async cardPdf(@Param("profileId") profileId: string, @CurrentUser() user: UserRow, @Res() response: Response) {
    const { pdf, filename } = await this.service.cardPdf(profileId, user);
    sendPdf(response, pdf, filename);
  }
}

@ApiTags("Shagun Digital Cards")
@Controller("sagun-booklets")
export class SagunBookletsController {
  constructor(private readonly service: SagunCardsService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Print history: generated booklets (admin)" })
  @ApiResponse({ status: 200, description: "Booklets, newest first" })
  history(@CurrentUser() user: UserRow) {
    return this.service.history(user);
  }

  @Post("plans")
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Profiles and page count a booklet would have (admin)" })
  @ApiResponse({ status: 200, description: "{ totalProfiles, totalPages }" })
  @ApiResponse({ status: 409, description: "A selected card may not be printed" })
  plan(@Body() dto: SagunBookletDto, @CurrentUser() user: UserRow) {
    return this.service.bookletPlan(dto, user);
  }

  @Post("previews")
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiProduces("application/pdf")
  @ApiOperation({ summary: "Booklet PDF preview, not saved and not added to the print history (admin)" })
  @ApiResponse({ status: 200, description: "PDF" })
  @ApiResponse({ status: 409, description: "A selected card may not be printed" })
  async preview(@Body() dto: SagunBookletDto, @CurrentUser() user: UserRow, @Res() response: Response) {
    const { pdf, totalPages } = await this.service.bookletPreview(dto, user);
    response.set("X-Total-Pages", String(totalPages));
    sendPdf(response, pdf, "sagun-booklet-preview.pdf");
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Generate the A4 booklet PDF, store it and record it in the print history (admin)" })
  @ApiResponse({ status: 201, description: "Print history entry" })
  @ApiResponse({ status: 409, description: "A selected card may not be printed" })
  generate(@Body() dto: SagunBookletDto, @CurrentUser() user: UserRow) {
    return this.service.generateBooklet(dto, user);
  }

  @Get(":id/pdf")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiProduces("application/pdf")
  @ApiOperation({ summary: "Download a generated booklet (admin)" })
  @ApiResponse({ status: 200, description: "PDF" })
  @ApiResponse({ status: 404, description: "Unknown booklet or file missing" })
  async pdf(@Param("id") id: string, @CurrentUser() user: UserRow, @Res() response: Response) {
    const { pdf, filename } = await this.service.historyPdf(id, user);
    sendPdf(response, pdf, filename, true);
  }
}

@Module({ controllers: [SagunCardsController, SagunBookletsController], providers: [SagunCardsService] })
export class SagunCardsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(publicLookupLimiter).forRoutes({ path: "sagun-cards/verifications/:token", method: RequestMethod.GET });
  }
}
