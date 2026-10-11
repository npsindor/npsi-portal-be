import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import rateLimit from "express-rate-limit";
import { ContactInfoController } from "./contact-info.controller.js";
import { ContactInfoService } from "./contact-info.service.js";

@Module({ controllers: [ContactInfoController], providers: [ContactInfoService] })
export class ContactInfoModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        rateLimit({
          windowMs: 15 * 60 * 1000,
          limit: 10,
          standardHeaders: true,
          legacyHeaders: false,
          message: { error: "Too many submissions; try again later" },
        }),
      )
      .forRoutes({ path: "contact-info", method: RequestMethod.POST });
  }
}
