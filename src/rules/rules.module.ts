import { Module } from "@nestjs/common";
import { RulesController } from "./rules.controller.js";
import { RulesRepository } from "./rules.repository.js";
import { RulesService } from "./rules.service.js";

@Module({ controllers: [RulesController], providers: [RulesService, RulesRepository], exports: [RulesRepository] })
export class RulesModule {}
