import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppConfigService } from "./app-config.service.js";
import { validateEnv } from "./env.validation.js";

// Env files are loaded by load-env.ts (same rule as the legacy app), so the
// config module only validates what is already in process.env.
@Global()
@Module({
  imports: [ConfigModule.forRoot({ ignoreEnvFile: true, validate: validateEnv })],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
