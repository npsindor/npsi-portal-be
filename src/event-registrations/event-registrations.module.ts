import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module.js";
import { MembershipModule } from "../membership/membership.module.js";
import { EventRegistrationsController } from "./event-registrations.controller.js";
import { EventRegistrationsRepository } from "./event-registrations.repository.js";
import { EventRegistrationsService } from "./event-registrations.service.js";

@Module({
  imports: [MembershipModule, EventsModule],
  controllers: [EventRegistrationsController],
  providers: [EventRegistrationsService, EventRegistrationsRepository],
  exports: [EventRegistrationsRepository],
})
export class EventRegistrationsModule {}
