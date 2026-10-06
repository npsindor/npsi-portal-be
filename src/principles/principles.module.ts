import { Module } from "@nestjs/common";
import { PrinciplesController } from "./principles.controller.js";
import { PrinciplesRepository } from "./principles.repository.js";
import { PrinciplesService } from "./principles.service.js";

@Module({ controllers: [PrinciplesController], providers: [PrinciplesService, PrinciplesRepository], exports: [PrinciplesRepository] })
export class PrinciplesModule {}
