import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module.js";
import { FamilyMembersModule } from "../family-members/family-members.module.js";
import { MembershipModule } from "../membership/membership.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { EventRegistrationsController } from "./event-registrations.controller.js";
import { EventRegistrationsRepository } from "./event-registrations.repository.js";
import { EventRegistrationsService } from "./event-registrations.service.js";

@Module({
  imports: [MembershipModule, EventsModule, FamilyMembersModule, TransactionsModule, NotificationsModule],
  controllers: [EventRegistrationsController],
  providers: [EventRegistrationsService, EventRegistrationsRepository],
  exports: [EventRegistrationsRepository],
})
export class EventRegistrationsModule {}
