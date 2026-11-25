import { Controller, Get, Module } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HomeMembersService } from "./home-members.service.js";

@ApiTags("Home page")
@Controller("home-members")
export class HomeMembersController {
  constructor(private readonly service: HomeMembersService) {}

  @Get("family-heads")
  @ApiOperation({ summary: "Public: name, village and photo of the family heads shown on the home page, A to Z by name (no ids or contacts)" })
  @ApiOkResponse({ description: "[{ id, name, place, photoUrl }]" })
  familyHeads() {
    return this.service.familyHeads();
  }

  @Get("birthdays")
  @ApiOperation({ summary: "Public: today's birthdays (India time) of adult members of the families shown on the home page" })
  @ApiOkResponse({ description: "[{ id, name, place, photoUrl }] — no birth date or age" })
  birthdays() {
    return this.service.birthdaysToday();
  }
}

@Module({ controllers: [HomeMembersController], providers: [HomeMembersService] })
export class HomeMembersModule {}
