import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { feedbackLimiter, roomSubmitLimiter } from "../common/rate-limit/limiters.js";
import { MembershipModule } from "../membership/membership.module.js";
import { FeedbackController } from "./feedback.controller.js";
import { FeedbackRepository } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";

@Module({ imports: [MembershipModule], controllers: [FeedbackController], providers: [FeedbackService, FeedbackRepository], exports: [FeedbackRepository] })
export class FeedbackModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(roomSubmitLimiter).forRoutes({ path: "feedback/public", method: RequestMethod.POST });
    consumer.apply(feedbackLimiter).forRoutes({ path: "feedback", method: RequestMethod.POST });
  }
}
