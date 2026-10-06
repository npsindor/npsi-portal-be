import { Module } from "@nestjs/common";
import { StudentsController } from "./students.controller.js";
import { StudentsRepository } from "./students.repository.js";
import { StudentsService } from "./students.service.js";

@Module({ controllers: [StudentsController], providers: [StudentsService, StudentsRepository], exports: [StudentsRepository] })
export class StudentsModule {}
