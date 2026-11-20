import { HttpException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { HealthErrorVo, HealthVo } from "./vo/health.vo.js";

// Public uptime check. It says only whether the API and its database answer: no database type, environment name
// or driver error goes out (the real error is logged for the server's operators).
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthVo> {
    try {
      await this.prisma.ping();
      return { ok: true };
    } catch (error) {
      this.logger.error(`Health check: database unreachable: ${error instanceof Error ? error.message : String(error)}`);
      const body: HealthErrorVo = { ok: false, error: "Service unavailable." };
      throw new HttpException(body, 503);
    }
  }
}
