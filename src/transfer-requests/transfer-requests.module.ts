import { Module } from "@nestjs/common";
import { MembershipModule } from "../membership/membership.module.js";
import { TransferRequestsController } from "./transfer-requests.controller.js";
import { TransferRequestsRepository } from "./transfer-requests.repository.js";
import { TransferRequestsService } from "./transfer-requests.service.js";

@Module({
  imports: [MembershipModule],
  controllers: [TransferRequestsController],
  providers: [TransferRequestsService, TransferRequestsRepository],
  exports: [TransferRequestsRepository],
})
export class TransferRequestsModule {}
