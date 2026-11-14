import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ErrorVo } from "../common/filters/error.vo.js";
import { UserGuard } from "../common/guards/auth.guards.js";
import { ApplicationStatusQueryDto, EmailQueryDto, FamilyIdParamDto, MobileQueryDto } from "./dto/lookups.dto.js";
import { LOOKUP_ROUTES as R } from "./lookups.routes.js";
import { LookupsService } from "./lookups.service.js";
import { ApplicationStatusVo, AvailabilityVo, FamilyVerificationVo, StatsVo } from "./vo/lookups.vo.js";

@ApiTags("public lookups")
@Controller()
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  // Logged-in members only: family ids are sequential, so a public lookup would let anyone list every family.
  @Get(R.verifyFamily)
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Verify a membership card: family summary by family id (logged-in members only)" })
  @ApiUnauthorizedResponse({ type: ErrorVo, description: "Not logged in" })
  @ApiOkResponse({ type: FamilyVerificationVo })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  verifyFamily(@Param() params: FamilyIdParamDto): Promise<FamilyVerificationVo> {
    return this.lookups.verifyFamily(params.familyId);
  }

  @Get(R.applicationStatus)
  @ApiOperation({ summary: "Track a family application by its id and the applicant's mobile" })
  @ApiOkResponse({ type: ApplicationStatusVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "applicationId or mobile missing" })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  applicationStatus(@Query() query: ApplicationStatusQueryDto): Promise<ApplicationStatusVo> {
    return this.lookups.applicationStatus(query);
  }

  @Get(R.mobileAvailability)
  @ApiOperation({ summary: "Whether a mobile number is already registered anywhere on the portal" })
  @ApiOkResponse({ type: AvailabilityVo })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  @ApiInternalServerErrorResponse({ type: ErrorVo, description: "Unexpected server or database error" })
  mobileAvailability(@Query() query: MobileQueryDto): Promise<AvailabilityVo> {
    return this.lookups.mobileAvailability(query);
  }

  @Get(R.emailAvailability)
  @ApiOperation({ summary: "Whether an email is already registered anywhere on the portal" })
  @ApiOkResponse({ type: AvailabilityVo })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  @ApiInternalServerErrorResponse({ type: ErrorVo, description: "Unexpected server or database error" })
  emailAvailability(@Query() query: EmailQueryDto): Promise<AvailabilityVo> {
    return this.lookups.emailAvailability(query);
  }

  @Get(R.stats)
  @ApiOperation({ summary: "Counts of active families and members" })
  @ApiOkResponse({ type: StatsVo })
  @ApiInternalServerErrorResponse({ type: ErrorVo, description: "Unexpected server or database error" })
  stats(): Promise<StatsVo> {
    return this.lookups.stats();
  }
}
