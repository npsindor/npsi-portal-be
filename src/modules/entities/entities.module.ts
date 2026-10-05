import { Module } from "@nestjs/common";
import { LookupsModule } from "../lookups/lookups.module.js";
import { ENTITY_CONTROLLERS } from "./entities.controller.js";
import { EntitiesRepository } from "./entities.repository.js";
import { EntitiesService } from "./entities.service.js";

@Module({ imports: [LookupsModule], controllers: ENTITY_CONTROLLERS, providers: [EntitiesService, EntitiesRepository], exports: [EntitiesRepository] })
export class EntitiesModule {}
