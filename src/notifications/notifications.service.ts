import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import type { CreateNotificationDto, NotificationListQueryDto, UpdateNotificationDto } from "./dto/notification.dto.js";
import { NotificationsRepository } from "./notifications.repository.js";
import { type NotificationVo, toNotificationVo } from "./vo/notification.vo.js";

export interface BatchResult {
  status: 200 | 201;
  records: NotificationVo[];
}

// Who may read, send and change notifications:
//  - admins: everything (blank recipient = everyone);
//  - members: read their family's and broadcast notifications, and mark them read.
// Workflows (sign-ups, approvals, event registrations, transfers) send their own
// notifications through NotificationsRepository and notification-texts.ts.
@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepository,
    private readonly membership: MembershipRepository,
  ) {}

  async list(user: UserRow, query: NotificationListQueryDto): Promise<NotificationVo[]> {
    const order = query.order ?? "-createdAt";
    const recipient = user.role === "admin" ? null : (await this.membership.ownFamilyId(user)) || "__none__";
    const rows = await this.repo.list(recipient, toOrderBy(order), query.limit ?? DEFAULT_LIMIT, query.offset);
    if (user.role === "admin") return rows.map(toNotificationVo);
    // A broadcast's read state is the member's own (family notifications share the family's flag).
    const readByMe = await this.repo.readBy(
      user.id,
      rows.filter(isBroadcast).map((row) => row.id),
    );
    return rows.map((row) => ({ ...toNotificationVo(row), read: isBroadcast(row) ? readByMe.has(row.id) : row.read }));
  }

  async create(dto: CreateNotificationDto): Promise<NotificationVo> {
    const input = { ...dto, recipientFamilyId: blankToNull(dto.recipientFamilyId) };
    return toNotificationVo(await this.repo.create({ id: randomId(), ...toCreateData(input) }));
  }

  async createBatch(records: CreateNotificationDto[] | undefined): Promise<BatchResult> {
    if (!records?.length) return { status: 200, records: [] };
    const rows = records.map((dto) => ({ id: randomId(), ...toCreateData({ ...dto, recipientFamilyId: blankToNull(dto.recipientFamilyId) }) }));
    return { status: 201, records: (await this.repo.createMany(rows)).map(toNotificationVo) };
  }

  async update(id: string, dto: UpdateNotificationDto, user: UserRow): Promise<NotificationVo> {
    let input: UpdateNotificationDto = { ...dto };
    if (user.role === "admin") {
      if ("recipientFamilyId" in input) input.recipientFamilyId = blankToNull(input.recipientFamilyId);
    } else {
      const notification = await this.repo.recipientOf(id);
      const ownFamilyId = await this.membership.ownFamilyId(user);
      if (!notification || (notification.recipientFamilyId && notification.recipientFamilyId !== ownFamilyId)) {
        throw new ApiError(403, "You can only update your own notifications.");
      }
      // Members may only mark notifications read; a broadcast only for themselves.
      if (!notification.recipientFamilyId) {
        if (input.read !== undefined) await this.repo.setReadBy(user.id, id, input.read);
        const row = await this.repo.findById(id);
        if (!row) throw new ApiError(404, "Record not found");
        return { ...toNotificationVo(row), read: (await this.repo.readBy(user.id, [id])).has(id) };
      }
      input = input.read === undefined ? {} : { read: input.read };
    }
    const data = toUpdateData(input);
    if (Object.values(data).some((value) => value !== undefined)) await this.repo.update(id, { ...data });
    const row = await this.repo.findById(id);
    if (!row) throw new ApiError(404, "Record not found");
    return toNotificationVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

// A notification for everyone (no recipient; older admin screens stored an empty one).
const isBroadcast = (row: { recipientFamilyId: string | null }): boolean => !row.recipientFamilyId;

// An admin's blank recipient means everyone, stored as NULL (an empty string matched no member).
const blankToNull = (value: string | null | undefined): string | null => (value?.trim() ? value : null);

// The API's camelCase fields as columns. Prisma skips fields that are undefined (not sent).
const toCreateData = (input: CreateNotificationDto): Omit<Prisma.NotificationUncheckedCreateInput, "id"> => ({
  title: input.title,
  message: input.message,
  type: input.type,
  recipientFamilyId: input.recipientFamilyId,
  read: input.read,
  date: parseDate(input.date),
  deepLink: input.deepLink,
});

const toUpdateData = (input: UpdateNotificationDto): Prisma.NotificationUncheckedUpdateInput => ({
  title: input.title,
  message: input.message,
  type: input.type,
  recipientFamilyId: input.recipientFamilyId,
  read: input.read,
  date: parseDate(input.date),
  deepLink: input.deepLink,
});
