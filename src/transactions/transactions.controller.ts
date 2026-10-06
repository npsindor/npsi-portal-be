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
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard } from "../common/guards/auth.guards.js";
import { CreateTransactionDto, TransactionListQueryDto, UpdateTransactionDto } from "./dto/transactions.dto.js";
import { TransactionsService } from "./transactions.service.js";
import { TransactionVo } from "./vo/transactions.vo.js";

@ApiTags("transactions")
@ApiBearerAuth()
@Controller("transactions")
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List transactions", description: "Admin only." })
  @ApiOkResponse({ type: TransactionVo, isArray: true })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Invalid order, limit or filter" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(@Query() query: TransactionListQueryDto): Promise<TransactionVo[]> {
    return this.transactions.list(query);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Create a transaction", description: "Admin only." })
  @ApiCreatedResponse({ type: TransactionVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() body: CreateTransactionDto): Promise<TransactionVo> {
    return this.transactions.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update a transaction", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiOkResponse({ type: TransactionVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
  update(@Param("id") id: string, @Body() body: UpdateTransactionDto): Promise<TransactionVo> {
    return this.transactions.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Delete a transaction", description: "Admin only." })
  @ApiParam({ name: "id", description: "Record id" })
  @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
  @ApiUnauthorizedResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.transactions.remove(id);
  }
}
