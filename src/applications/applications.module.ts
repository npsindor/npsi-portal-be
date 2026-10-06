import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FamiliesModule } from "../families/families.module.js";
import { FamilyMembersModule } from "../family-members/family-members.module.js";
import { LookupsModule } from "../lookups/lookups.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { ApplicationReviewService } from "./application-review.service.js";
import { ApplicationsController } from "./applications.controller.js";
import { ApplicationsRepository } from "./applications.repository.js";
import { ApplicationsService } from "./applications.service.js";

@Module({
  imports: [LookupsModule, AuthModule, FamiliesModule, FamilyMembersModule, NotificationsModule, TransactionsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationReviewService, ApplicationsRepository],
  exports: [ApplicationsRepository],
})
export class ApplicationsModule {}
