import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { toJsonInput } from "../common/utils/json.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { pick } from "../common/utils/objects.js";
import { EventsRepository } from "../events/events.repository.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import type { CreateEventRegistrationDto, EventRegistrationListQueryDto, UpdateEventRegistrationDto } from "./dto/event-registrations.dto.js";
import { EventRegistrationsRepository } from "./event-registrations.repository.js";
import { type EventRegistrationVo, toEventRegistrationVo } from "./vo/event-registrations.vo.js";

// The fields the member's event registration form sends; the rest is admin-only.
const MEMBER_FIELDS = [
  "registrationId",
  "eventId",
  "eventTitle",
  "familyId",
  "memberIds",
  "memberNames",
  "count",
  "feePerMember",
  "totalFee",
  "paymentStatus",
  "transactionId",
  "status",
  "registeredById",
  "registeredDate",
  "registrantName",
] as const;
// Members register their own family's members for an event; the fee is
// computed here from the event (no payment gateway; admins reconcile).
@Injectable()
export class EventRegistrationsService {
  constructor(
    private readonly repo: EventRegistrationsRepository,
    private readonly membership: MembershipRepository,
    private readonly events: EventsRepository,
  ) {}

  async list(query: EventRegistrationListQueryDto): Promise<EventRegistrationVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT);
    return rows.map(toEventRegistrationVo);
  }

  async create(dto: CreateEventRegistrationDto, user: UserRow): Promise<EventRegistrationVo> {
    const input: CreateEventRegistrationDto = user.role === "admin" ? { ...dto } : pick(dto, MEMBER_FIELDS);
    if (user.role !== "admin") {
      assertNoMarkup(input);
      await this.applyMemberRules(input, user);
    }
    return toEventRegistrationVo(await this.repo.create({ id: randomId(), ...toCreateData(input) }));
  }

  async update(id: string, dto: UpdateEventRegistrationDto): Promise<EventRegistrationVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toEventRegistrationVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  private async applyMemberRules(input: CreateEventRegistrationDto, user: UserRow): Promise<void> {
    const ownFamilyId = await this.membership.ownFamilyId(user);
    if (!ownFamilyId || input.familyId !== ownFamilyId) throw new ApiError(403, "You can only register your own family for events.");
    const memberIds = Array.isArray(input.memberIds) ? (input.memberIds as unknown[]) : [];
    if (memberIds.length) {
      const own = new Set(await this.membership.memberIdsOfFamily(ownFamilyId));
      if (!memberIds.every((id) => own.has(id as string))) throw new ApiError(403, "You can only register members of your own family.");
    }
    const feePerMember = await this.events.feeOf(input.eventId);
    if (feePerMember === null) throw new ApiError(404, "Event not found.");
    const totalFee = feePerMember * memberIds.length;
    Object.assign(input, { feePerMember, totalFee, paymentStatus: totalFee === 0 ? "SUCCESS" : "PENDING", registeredById: user.id });
  }
}
// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateEventRegistrationDto): Omit<Prisma.EventRegistrationUncheckedCreateInput, "id"> => ({
  registrationId: input.registrationId,
  eventId: input.eventId,
  eventTitle: input.eventTitle,
  familyId: input.familyId,
  memberIds: toJsonInput(input.memberIds),
  memberNames: toJsonInput(input.memberNames),
  count: input.count,
  feePerMember: input.feePerMember,
  totalFee: input.totalFee,
  paymentStatus: input.paymentStatus,
  transactionId: input.transactionId,
  status: input.status,
  registeredById: input.registeredById,
  registeredDate: parseDate(input.registeredDate),
  registrantName: input.registrantName,
  registrantEmail: input.registrantEmail,
});

const toUpdateData = (input: UpdateEventRegistrationDto): Prisma.EventRegistrationUncheckedUpdateInput => ({
  registrationId: input.registrationId,
  eventId: input.eventId,
  eventTitle: input.eventTitle,
  familyId: input.familyId,
  memberIds: toJsonInput(input.memberIds),
  memberNames: toJsonInput(input.memberNames),
  count: input.count,
  feePerMember: input.feePerMember,
  totalFee: input.totalFee,
  paymentStatus: input.paymentStatus,
  transactionId: input.transactionId,
  status: input.status,
  registeredById: input.registeredById,
  registeredDate: parseDate(input.registeredDate),
  registrantName: input.registrantName,
  registrantEmail: input.registrantEmail,
  updatedAt: new Date(),
});
