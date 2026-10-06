import { Module } from "@nestjs/common";
import { TransactionsController } from "./transactions.controller.js";
import { TransactionsRepository } from "./transactions.repository.js";
import { TransactionsService } from "./transactions.service.js";

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository],
  exports: [TransactionsRepository],
})
export class TransactionsModule {}
