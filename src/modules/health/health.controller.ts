import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service.js";
import { HealthErrorVo, HealthVo } from "./vo/health.vo.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Check that the API and its database are reachable" })
  @ApiOkResponse({ type: HealthVo })
  @ApiServiceUnavailableResponse({ type: HealthErrorVo, description: "Database unreachable" })
  check(): Promise<HealthVo> {
    return this.health.check();
  }
}
