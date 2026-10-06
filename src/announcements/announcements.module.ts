import { Module } from "@nestjs/common";
import { AnnouncementsController } from "./announcements.controller.js";
import { AnnouncementsRepository } from "./announcements.repository.js";
import { AnnouncementsService } from "./announcements.service.js";

@Module({ controllers: [AnnouncementsController], providers: [AnnouncementsService, AnnouncementsRepository], exports: [AnnouncementsRepository] })
export class AnnouncementsModule {}
