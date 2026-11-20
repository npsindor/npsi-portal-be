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
  // Marks the verified challenge used; returns how its code was delivered (WHATSAPP, SMS, EMAIL, DEV), or null when
  // the token is unknown, used or expired.
  async consume(tokenHash: string, mobileDigits: string, purpose: string): Promise<string | null> {
    const where = { tokenHash, mobileDigits, purpose, usedAt: null, tokenExpiresAt: { gt: new Date() } };
    const challenge = await this.prisma.otpChallenge.findFirst({ where, select: { channel: true } });
    if (!challenge) return null;
    const { count } = await this.prisma.otpChallenge.updateMany({ where, data: { usedAt: new Date() } });
    return count === 1 ? challenge.channel : null;
  }
}
