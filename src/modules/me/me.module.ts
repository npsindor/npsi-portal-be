import { Module } from "@nestjs/common";
import { MeController } from "./me.controller.js";
import { MeRepository } from "./me.repository.js";
import { MeService } from "./me.service.js";

@Module({ controllers: [MeController], providers: [MeService, MeRepository] })
export class MeModule {}
