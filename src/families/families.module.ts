import { Module } from "@nestjs/common";
import { MembershipModule } from "../membership/membership.module.js";
import { FamiliesController } from "./families.controller.js";
import { FamiliesRepository } from "./families.repository.js";
import { FamiliesService } from "./families.service.js";

@Module({ imports: [MembershipModule], controllers: [FamiliesController], providers: [FamiliesService, FamiliesRepository], exports: [FamiliesRepository] })
export class FamiliesModule {}
