import { Body, Controller, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from "@nestjs/swagger";
import { ContactInfoThanksVo, CreateContactInfoDto } from "./contact-info.dto.js";
import { ContactInfoService } from "./contact-info.service.js";

@ApiTags("contact info")
@Controller("contact-info")
export class ContactInfoController {
  constructor(private readonly contacts: ContactInfoService) {}

  @Post()
  @ApiOperation({ summary: "Submit community contact details without an account" })
  @ApiCreatedResponse({ type: ContactInfoThanksVo })
  @ApiBadRequestResponse({ description: "Invalid or missing contact details" })
  @ApiTooManyRequestsResponse({ description: "Too many submissions; try again later" })
  create(@Body() dto: CreateContactInfoDto): Promise<ContactInfoThanksVo> {
    return this.contacts.create(dto);
  }
}
