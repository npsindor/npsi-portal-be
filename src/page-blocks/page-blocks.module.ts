import { Module } from "@nestjs/common";
import { PageBlocksController } from "./page-blocks.controller.js";
import { PageBlocksRepository } from "./page-blocks.repository.js";
import { PageBlocksService } from "./page-blocks.service.js";

@Module({ controllers: [PageBlocksController], providers: [PageBlocksService, PageBlocksRepository] })
export class PageBlocksModule {}
