import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { availabilityLimiter, publicLookupLimiter } from "../common/rate-limit/limiters.js";
import { AvailabilityService } from "./availability.service.js";
import { LookupsController } from "./lookups.controller.js";
import { LookupsRepository } from "./lookups.repository.js";
import { LOOKUP_ROUTES as R } from "./lookups.routes.js";
import { LookupsService } from "./lookups.service.js";

@Module({ controllers: [LookupsController], providers: [LookupsService, LookupsRepository, AvailabilityService], exports: [AvailabilityService] })
export class LookupsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(publicLookupLimiter)
      .forRoutes({ path: R.verifyFamily, method: RequestMethod.GET }, { path: R.applicationStatus, method: RequestMethod.GET });
    consumer
      .apply(availabilityLimiter)
      .forRoutes({ path: R.mobileAvailability, method: RequestMethod.GET }, { path: R.emailAvailability, method: RequestMethod.GET });
  }
}
