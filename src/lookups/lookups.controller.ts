import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { ErrorVo } from "../common/filters/error.vo.js";
import { ENTITY_VOS, type EntityVo } from "../entities/vo/entity.vo.js";
import { ApplicationStatusQueryDto, EmailQueryDto, FamilyIdParamDto, MobileQueryDto } from "./dto/lookups.dto.js";
import { LOOKUP_ROUTES as R } from "./lookups.routes.js";
import { LookupsService } from "./lookups.service.js";
import { AvailabilityVo, FamilyVerificationVo, StatsVo } from "./vo/lookups.vo.js";

@ApiTags("public lookups")
@ApiExtraModels(ENTITY_VOS.Application)
@Controller()
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get(R.verifyFamily)
  @ApiOperation({ summary: "Verify a membership card: public family summary by family id" })
  @ApiOkResponse({ type: FamilyVerificationVo })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  verifyFamily(@Param() params: FamilyIdParamDto): Promise<FamilyVerificationVo> {
    return this.lookups.verifyFamily(params.familyId);
  }

  @Get(R.applicationStatus)
  @ApiOperation({ summary: "Track a family application by its id and the applicant's mobile" })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(ENTITY_VOS.Application) } })
  @ApiBadRequestResponse({ type: ErrorVo, description: "applicationId or mobile missing" })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  applicationStatus(@Query() query: ApplicationStatusQueryDto): Promise<EntityVo> {
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
