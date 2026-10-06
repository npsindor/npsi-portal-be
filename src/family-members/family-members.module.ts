import { Module } from "@nestjs/common";
import { MembershipModule } from "../membership/membership.module.js";
import { FamilyMembersController } from "./family-members.controller.js";
import { FamilyMembersRepository } from "./family-members.repository.js";
import { FamilyMembersService } from "./family-members.service.js";

@Module({
  imports: [MembershipModule],
  controllers: [FamilyMembersController],
  providers: [FamilyMembersService, FamilyMembersRepository],
  exports: [FamilyMembersRepository],
})
export class FamilyMembersModule {}
