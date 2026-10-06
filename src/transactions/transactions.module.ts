import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module.js";
import { MembershipModule } from "../membership/membership.module.js";
import { TransactionsController } from "./transactions.controller.js";
import { TransactionsRepository } from "./transactions.repository.js";
import { TransactionsService } from "./transactions.service.js";

@Module({
  imports: [MembershipModule, EventsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository],
  exports: [TransactionsRepository],
})
export class TransactionsModule {}
