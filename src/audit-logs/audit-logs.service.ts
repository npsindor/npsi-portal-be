import { Injectable } from "@nestjs/common";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { escapeLike } from "../common/utils/text.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { cleanSnapshot, labelOf, SNAPSHOT_MODELS } from "./audit-logs.rules.js";

type FindUnique = { findUnique: (args: { where: Record<string, string> }) => Promise<unknown> };

export interface AuditListQuery {
  q?: string;
  resource?: string;
  role?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly db: PrismaService) {}

  // The record a DELETE route is about to remove (before the handler runs), or null.
  async snapshot(pattern: string, params: Record<string, string>): Promise<unknown> {
    const target = SNAPSHOT_MODELS[pattern];
    const value = target ? params[target.param] : undefined;
    if (!target || !value) return null;
    const delegate = (this.db as unknown as Record<string, FindUnique | undefined>)[target.model];
    if (!delegate?.findUnique) return null;
    try {
      return await delegate.findUnique({ where: { [target.key ?? "id"]: value } });
    } catch {
      return null;
    }
  }

  private async roleOf(user: UserRow | null | undefined): Promise<string | null> {
    if (!user) return null;
    if (user.role === "admin") return "SUPER_ADMIN";
    const staff = await this.db.adminAccess.findUnique({ where: { userId: user.id } }).catch(() => null);
    return staff?.active ? "ADMIN_STAFF" : "MEMBER";
  }

  async record(entry: { resource: string; recordId: string | null; path: string; user: UserRow | null | undefined; row: unknown }): Promise<void> {
    await this.db.auditLog.create({
      data: {
        id: randomId(),
        action: "DELETE",
        resource: entry.resource,
        recordId: entry.recordId?.slice(0, 255) ?? null,
        label: labelOf(entry.row),
        path: entry.path.slice(0, 500),
        actorUserId: entry.user?.id ?? null,
        actorName: entry.user?.fullName ?? null,
        actorEmail: entry.user?.email ?? null,
        actorRole: await this.roleOf(entry.user),
        snapshot: (cleanSnapshot(entry.row) ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  // Super admin: newest first, with filters and the list of resources for the filter.
  async list(query: AuditListQuery) {
    const q = query.q ? escapeLike(query.q) : null;
    const created: Prisma.DateTimeFilter = {};
    if (query.from) created.gte = new Date(`${query.from}T00:00:00+05:30`);
    if (query.to) created.lte = new Date(`${query.to}T23:59:59+05:30`);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.resource ? { resource: query.resource } : {}),
      ...(query.role ? { actorRole: query.role } : {}),
      ...(query.from || query.to ? { createdAt: created } : {}),
      ...(q
        ? {
            OR: [
              { label: { contains: q } },
              { recordId: { contains: q } },
              { actorName: { contains: q } },
              { actorEmail: { contains: q } },
              { path: { contains: q } },
            ],
          }
        : {}),
    };
    const [rows, total, resources] = await Promise.all([
      this.db.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit ?? 50, skip: query.offset ?? 0 }),
      this.db.auditLog.count({ where }),
      this.db.auditLog.findMany({ distinct: ["resource"], select: { resource: true }, orderBy: { resource: "asc" }, take: 200 }),
    ]);
    return { rows, total, resources: resources.map((row) => row.resource) };
  }
}
