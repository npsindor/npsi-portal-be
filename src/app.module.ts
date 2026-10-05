import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { CommonModule } from "./common/common.module.js";
import { AppConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { EntitiesModule } from "./entities/entities.module.js";
import { HealthModule } from "./health/health.module.js";
import { LookupsModule } from "./lookups/lookups.module.js";
import { MeModule } from "./me/me.module.js";
import { UploadsModule } from "./uploads/uploads.module.js";

@Module({
  imports: [AppConfigModule, DatabaseModule, CommonModule, HealthModule, AuthModule, MeModule, LookupsModule, UploadsModule, EntitiesModule],
})
export class AppModule {}
