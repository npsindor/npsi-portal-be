import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { UserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { FeedbackVo } from "../feedback/vo/feedback.vo.js";
import { MeService } from "./me.service.js";
import { MyFamilyVo } from "./vo/me.vo.js";

@ApiTags("me")
@ApiBearerAuth()
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
  @ApiOkResponse({ type: FeedbackVo, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  feedback(@CurrentUser() user: UserRow): Promise<FeedbackVo[]> {
    return this.me.feedback(user);
  }
}
