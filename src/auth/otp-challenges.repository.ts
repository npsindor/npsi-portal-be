import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { OtpChallenge } from "../generated/prisma/client.js";

@Injectable()
export class OtpChallengesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { id: string; mobileDigits: string; purpose: string; codeHash: string; channel: string; expiresAt: Date }): Promise<OtpChallenge> {
    return this.prisma.otpChallenge.create({ data });
  }

  countSince(mobileDigits: string, since: Date): Promise<number> {
    return this.prisma.otpChallenge.count({ where: { mobileDigits, createdAt: { gte: since } } });
  }

  latest(mobileDigits: string, purpose: string): Promise<OtpChallenge | null> {
    return this.prisma.otpChallenge.findFirst({ where: { mobileDigits, purpose }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  }

  async addAttempt(id: string): Promise<void> {
    await this.prisma.otpChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } });
  }

  async markVerified(id: string, tokenHash: string, tokenExpiresAt: Date): Promise<void> {
    await this.prisma.otpChallenge.update({ where: { id }, data: { verifiedAt: new Date(), tokenHash, tokenExpiresAt } });
  }

  // Single use: only the first caller gets true.
  async consume(tokenHash: string, mobileDigits: string, purpose: string): Promise<boolean> {
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: { tokenHash, mobileDigits, purpose, usedAt: null, tokenExpiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }
}
