import { Module } from "@nestjs/common";
import { FeedbackController } from "./feedback.controller.js";
import { FeedbackRepository } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";

@Module({ controllers: [FeedbackController], providers: [FeedbackService, FeedbackRepository], exports: [FeedbackRepository] })
export class FeedbackModule {}
