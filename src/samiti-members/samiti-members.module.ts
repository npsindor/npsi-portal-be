import { Module } from "@nestjs/common";
import { SamitiMembersController } from "./samiti-members.controller.js";
import { SamitiMembersRepository } from "./samiti-members.repository.js";
import { SamitiMembersService } from "./samiti-members.service.js";

@Module({ controllers: [SamitiMembersController], providers: [SamitiMembersService, SamitiMembersRepository], exports: [SamitiMembersRepository] })
export class SamitiMembersModule {}
