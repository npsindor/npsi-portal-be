import { Module } from "@nestjs/common";
import { LookupsModule } from "../lookups/lookups.module.js";
import { ApplicationsController } from "./applications.controller.js";
import { ApplicationsRepository } from "./applications.repository.js";
import { ApplicationsService } from "./applications.service.js";

@Module({
  imports: [LookupsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationsRepository],
  exports: [ApplicationsRepository],
})
export class ApplicationsModule {}
