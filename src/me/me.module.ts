import { Module } from "@nestjs/common";
import { MembershipModule } from "../membership/membership.module.js";
import { MeController } from "./me.controller.js";
import { MeRepository } from "./me.repository.js";
import { MeService } from "./me.service.js";

@Module({ imports: [MembershipModule], controllers: [MeController], providers: [MeService, MeRepository] })
export class MeModule {}
