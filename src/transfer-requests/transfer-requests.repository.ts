import { Injectable } from "@nestjs/common";
import { displayIdAt, displayIdPrefixRange } from "../common/utils/display-ids.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Prisma, TransferRequest } from "../generated/prisma/client.js";

@Injectable()
export class TransferRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.TransferRequestWhereInput, orderBy: Prisma.TransferRequestOrderByWithRelationInput[], take: number, skip = 0): Promise<TransferRequest[]> {
    return this.prisma.transferRequest.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<TransferRequest | null> {
    return db.transferRequest.findUnique({ where: { id } });
  }

  create(data: Prisma.TransferRequestUncheckedCreateInput, db: Db = this.prisma): Promise<TransferRequest> {
    return db.transferRequest.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.TransferRequestUncheckedUpdateInput, db: Db = this.prisma): Promise<TransferRequest | null> {
    // MySQL reports 0 changed rows when nothing changes (e.g. only ignored fields were sent), so the row's existence
    // decides the 404, not the count.
    await db.transferRequest.updateMany({ where: { id }, data });
    return this.findById(id, db);
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.transferRequest.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one, plus the highest number ever handed out
  // (display_id_counters), so a deleted request's number is never given to a new one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const [rows, counter] = await Promise.all([
      db.transferRequest.findMany({
        where: { requestId: displayIdPrefixRange(prefix) },
        orderBy: { requestId: "desc" },
        take: 20,
        select: { requestId: true },
      }),
      db.displayIdCounter.findUnique({ where: { prefix } }),
    ]);
    return [...rows.map((row) => row.requestId), ...(counter?.last ? [displayIdAt(prefix, counter.last)] : [])];
  }

  // Remembers the number just handed out (call in the transaction that created the request).
  async recordDisplayId(prefix: string, displayId: string, db: Db = this.prisma): Promise<void> {
    const number = Number(displayId.slice(prefix.length));
    if (!Number.isInteger(number)) return;
    const counter = await db.displayIdCounter.findUnique({ where: { prefix } });
    if (!counter) await db.displayIdCounter.create({ data: { prefix, last: number } });
    else if (number > counter.last) await db.displayIdCounter.update({ where: { prefix }, data: { last: number } });
  }

  // The open request (PENDING / CORRECTION_REQUIRED) for a member ("M:<membership id>") or student ("S:<student id>").
  findOpen(openKey: string, db: Db = this.prisma): Promise<TransferRequest | null> {
    return db.transferRequest.findUnique({ where: { openKey } });
  }

  // The member's or student's other open requests, closed once one request for them has been decided.
  async closeOthers(request: TransferRequest, remarks: string, db: Db = this.prisma): Promise<number> {
    const subject: Prisma.TransferRequestWhereInput[] = [
      ...(request.sourceMembershipId ? [{ sourceMembershipId: request.sourceMembershipId }] : []),
      ...(request.sourceStudentId ? [{ sourceStudentId: request.sourceStudentId }] : []),
    ];
    if (!subject.length) return 0;
    const { count } = await db.transferRequest.updateMany({
      where: { id: { not: request.id }, status: { in: ["PENDING", "CORRECTION_REQUIRED"] }, OR: subject },
      data: { status: "REJECTED", adminRemarks: remarks, openKey: null },
    });
    return count;
  }

  // How many requests an account filed since a moment (rate limit).
  countByRequesterSince(requesterId: string, since: Date): Promise<number> {
    return this.prisma.transferRequest.count({ where: { requesterId, createdAt: { gte: since } } });
  }
}
