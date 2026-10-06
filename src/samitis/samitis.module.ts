import { Module } from "@nestjs/common";
import { SamitisController } from "./samitis.controller.js";
import { SamitisRepository } from "./samitis.repository.js";
import { SamitisService } from "./samitis.service.js";

@Module({ controllers: [SamitisController], providers: [SamitisService, SamitisRepository], exports: [SamitisRepository] })
export class SamitisModule {}
