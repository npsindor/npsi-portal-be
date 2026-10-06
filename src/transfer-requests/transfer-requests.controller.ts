import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard, UserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { CreateTransferRequestDto, TransferRequestListQueryDto, UpdateTransferRequestDto } from "./dto/transfer-requests.dto.js";
import { TransferRequestsService } from "./transfer-requests.service.js";
import { TransferRequestVo } from "./vo/transfer-requests.vo.js";

@ApiTags("transfer-requests")
@ApiBearerAuth()
@Controller("transfer-requests")
export class TransferRequestsController {
  constructor(private readonly transferRequests: TransferRequestsService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List transfer requests", description: "Admin only." })
  @ApiOkResponse({ type: TransferRequestVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(@Query() query: TransferRequestListQueryDto): Promise<TransferRequestVo[]> {
    return this.transferRequests.list(query);
  }

  @Post()
  @UseGuards(UserGuard)
  @ApiOperation({ summary: "Create a transfer request", description: "Any logged-in user." })
  @ApiCreatedResponse({ type: TransferRequestVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  create(@Body() body: CreateTransferRequestDto, @CurrentUser() user: UserRow): Promise<TransferRequestVo> {
    return this.transferRequests.create(body, user);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a transfer request", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: TransferRequestVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateTransferRequestDto): Promise<TransferRequestVo> {
    return this.transferRequests.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a transfer request", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.transferRequests.remove(id);
  }
}
