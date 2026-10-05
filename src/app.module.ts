import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module.js";
import { AppConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { EntitiesModule } from "./modules/entities/entities.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { LookupsModule } from "./modules/lookups/lookups.module.js";
import { MeModule } from "./modules/me/me.module.js";
import { UploadsModule } from "./modules/uploads/uploads.module.js";

@Module({
  imports: [AppConfigModule, DatabaseModule, CommonModule, HealthModule, AuthModule, MeModule, LookupsModule, UploadsModule, EntitiesModule],
})
export class AppModule {}
