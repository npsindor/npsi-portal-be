import { Module } from "@nestjs/common";
import { MembershipRepository } from "./membership.repository.js";

@Module({ providers: [MembershipRepository], exports: [MembershipRepository] })
export class MembershipModule {}
