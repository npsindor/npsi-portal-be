import { Module } from "@nestjs/common";
import { FamiliesModule } from "../families/families.module.js";
import { FamilyMembersModule } from "../family-members/family-members.module.js";
import { MembershipModule } from "../membership/membership.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { StudentsModule } from "../students/students.module.js";
import { TransferRequestReviewService } from "./transfer-request-review.service.js";
import { TransferRequestsController } from "./transfer-requests.controller.js";
import { TransferRequestsRepository } from "./transfer-requests.repository.js";
import { TransferRequestsService } from "./transfer-requests.service.js";

@Module({
  imports: [MembershipModule, FamiliesModule, FamilyMembersModule, StudentsModule, NotificationsModule],
  controllers: [TransferRequestsController],
  providers: [TransferRequestsService, TransferRequestReviewService, TransferRequestsRepository],
  exports: [TransferRequestsRepository],
})
export class TransferRequestsModule {}
