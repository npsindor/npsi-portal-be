import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse, getSchemaPath } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../../common/filters/error.vo.js";
import { UserGuard } from "../../common/guards/auth.guards.js";
import type { UserRow } from "../../common/session/session.service.js";
import { ENTITY_VOS, type EntityVo } from "../entities/vo/entity.vo.js";
import { MeService } from "./me.service.js";
import { MyFamilyVo } from "./vo/me.vo.js";

@ApiTags("me")
@ApiBearerAuth()
@ApiExtraModels(ENTITY_VOS.Family, ENTITY_VOS.FamilyMember, ENTITY_VOS.Student, ENTITY_VOS.Feedback)
@UseGuards(UserGuard)
@Controller("me")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get("family")
  @ApiOperation({ summary: "The logged-in member's family, its members and their student record" })
  @ApiOkResponse({ type: MyFamilyVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  family(@CurrentUser() user: UserRow): Promise<MyFamilyVo> {
    return this.me.family(user);
  }

  @Get("feedback")
  @ApiOperation({ summary: "Feedback submitted with the logged-in member's email (latest 100)" })
  @ApiOkResponse({ schema: { type: "array", items: { $ref: getSchemaPath(ENTITY_VOS.Feedback) } } })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  feedback(@CurrentUser() user: UserRow): Promise<EntityVo[]> {
    return this.me.feedback(user);
  }
}
