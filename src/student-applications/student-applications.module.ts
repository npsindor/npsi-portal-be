import { Module } from "@nestjs/common";
import { LookupsModule } from "../lookups/lookups.module.js";
import { StudentApplicationsController } from "./student-applications.controller.js";
import { StudentApplicationsRepository } from "./student-applications.repository.js";
import { StudentApplicationsService } from "./student-applications.service.js";

@Module({
  imports: [LookupsModule],
  controllers: [StudentApplicationsController],
  providers: [StudentApplicationsService, StudentApplicationsRepository],
  exports: [StudentApplicationsRepository],
})
export class StudentApplicationsModule {}
