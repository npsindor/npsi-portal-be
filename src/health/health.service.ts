import { HttpException, Injectable } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service.js";
import { PrismaService } from "../database/prisma.service.js";
import type { HealthErrorVo, HealthVo } from "./vo/health.vo.js";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async check(): Promise<HealthVo> {
    try {
      await this.prisma.ping();
      return { ok: true, database: "mysql", env: this.config.appEnv };
    } catch (error) {
      const body: HealthErrorVo = { ok: false, error: error instanceof Error ? error.message : String(error) };
      throw new HttpException(body, 503);
    }
  }
}
