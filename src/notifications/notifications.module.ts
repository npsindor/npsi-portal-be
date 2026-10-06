import { Module } from "@nestjs/common";
import { MembershipModule } from "../membership/membership.module.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsRepository } from "./notifications.repository.js";
import { NotificationsService } from "./notifications.service.js";

@Module({ imports: [MembershipModule], controllers: [NotificationsController], providers: [NotificationsService, NotificationsRepository] })
export class NotificationsModule {}
