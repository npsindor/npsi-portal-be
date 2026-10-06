import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { assertNoMarkup } from "../common/utils/markup.js";
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
//  - members: read their family's and broadcast notifications, mark them read,
//    and send one to their own family or to a family they just asked to transfer to;
//  - anyone: the one "application submitted" notification for an application
//    submitted moments ago.
// Field types and required fields are checked by the DTOs before this runs.
@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepository,
    private readonly membership: MembershipRepository,
  ) {}

  async list(user: UserRow, query: NotificationListQueryDto): Promise<NotificationVo[]> {
    const order = query.order ?? "-createdAt";
    const recipient = user.role === "admin" ? null : (await this.membership.ownFamilyId(user)) || "__none__";
    const rows = await this.repo.list(recipient, toOrderBy(order), query.limit ?? DEFAULT_LIMIT);
    return rows.map(toNotificationVo);
  }

  async create(dto: CreateNotificationDto, user: UserRow | null): Promise<NotificationVo> {
    const input = { ...dto };
    if (user?.role === "admin") input.recipientFamilyId = blankToNull(input.recipientFamilyId);
    else await this.applyNonAdminRules(input, user);
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
      // Members may only mark notifications read.
      input = input.read === undefined ? {} : { read: input.read };
    }
    const data = toUpdateData(input);
    if (Object.values(data).some((value) => value !== undefined)) await this.repo.update(id, { ...data, updatedAt: new Date() });
    const row = await this.repo.findById(id);
    if (!row) throw new ApiError(404, "Record not found");
    return toNotificationVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  // Never a broadcast, never a link, no markup. Allowed to an application
  // submitted moments ago (once, as its "submitted" notice), to the member's own
  // family, or to the family they just requested a transfer to.
  private async applyNonAdminRules(input: CreateNotificationDto, user: UserRow | null): Promise<void> {
    assertNoMarkup(input);
    const recipient = input.recipientFamilyId?.trim() ?? "";
    if (!recipient) throw new ApiError(403, "Only admins can send notifications to everyone.");
    input.recipientFamilyId = recipient;
    delete input.deepLink;
    delete input.read;
    if (await this.membership.recentApplicationKind(recipient)) {
      if (await this.repo.exists(recipient, "Registration")) throw new ApiError(409, "This application has already been notified.");
      input.type = "Registration";
      return;
    }
    if (user && (recipient === (await this.membership.ownFamilyId(user)) || (await this.membership.recentTransferTo(user.id, recipient)))) return;
    throw new ApiError(403, "You can't send a notification to this family.");
  }
}

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
