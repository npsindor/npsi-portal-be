import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ListQueryDto } from "../common/dto/list-query.dto.js";
import { AdminGuard } from "../common/guards/auth.guards.js";
import { ContactInfoPageVo, ContactInfoThanksVo, CreateContactInfoDto } from "./contact-info.dto.js";
import { ContactInfoService } from "./contact-info.service.js";

@ApiTags("contact info")
@Controller("contact-info")
export class ContactInfoController {
  constructor(private readonly contacts: ContactInfoService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List community contacts (admin only), newest first", description: "Pagination uses limit (default 100, maximum 500) and offset." })
  @ApiOkResponse({ type: ContactInfoPageVo })
  @ApiBadRequestResponse({ description: "Invalid pagination" })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Admin access required" })
  list(@Query() query: ListQueryDto): Promise<ContactInfoPageVo> {
    return this.contacts.list(query);
  }

  @Post()
  @ApiOperation({ summary: "Submit community contact details without an account" })
  @ApiCreatedResponse({ type: ContactInfoThanksVo })
  @ApiBadRequestResponse({ description: "Invalid or missing contact details" })
  @ApiTooManyRequestsResponse({ description: "Too many submissions; try again later" })
  create(@Body() dto: CreateContactInfoDto): Promise<ContactInfoThanksVo> {
    return this.contacts.create(dto);
  }
}
