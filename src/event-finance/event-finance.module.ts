import { Module } from "@nestjs/common";
import { EventFinanceController } from "./event-finance.controller.js";
import { EventFinanceService } from "./event-finance.service.js";

@Module({ controllers: [EventFinanceController], providers: [EventFinanceService] })
export class EventFinanceModule {}
