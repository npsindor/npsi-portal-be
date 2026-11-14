import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LookupsModule } from "../lookups/lookups.module.js";
import { MembershipModule } from "../membership/membership.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { StudentsModule } from "../students/students.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { StudentApplicationReviewService } from "./student-application-review.service.js";
import { StudentApplicationsController } from "./student-applications.controller.js";
import { StudentApplicationsRepository } from "./student-applications.repository.js";
import { StudentApplicationsService } from "./student-applications.service.js";

@Module({
  imports: [LookupsModule, MembershipModule, AuthModule, StudentsModule, NotificationsModule, TransactionsModule],
  controllers: [StudentApplicationsController],
  providers: [StudentApplicationsService, StudentApplicationReviewService, StudentApplicationsRepository],
  exports: [StudentApplicationsRepository],
})
export class StudentApplicationsModule {}
