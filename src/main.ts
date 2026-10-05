import "./config/load-env.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { AppConfigService } from "./config/app-config.service.js";
import { configureApp } from "./configure-app.js";

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: ["error", "warn"] });
  configureApp(app);
  const port = app.get(AppConfigService).port;
  await app.listen(port);
  console.log(`MySQL API listening on http://localhost:${port}`);
};

void bootstrap();
