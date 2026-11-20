import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId, isUniqueViolation } from "../common/utils/display-ids.js";
import { toJsonInput } from "../common/utils/json.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { pick } from "../common/utils/objects.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import { EventsRepository } from "../events/events.repository.js";
import { FamilyMembersRepository } from "../family-members/family-members.repository.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import { workflowNotification } from "../notifications/notification-texts.js";
import { NotificationsRepository } from "../notifications/notifications.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import type { CreateEventRegistrationDto, EventRegistrationListQueryDto, UpdateEventRegistrationDto } from "./dto/event-registrations.dto.js";
import { EventRegistrationsRepository } from "./event-registrations.repository.js";
import { type EventRegistrationVo, toEventRegistrationVo } from "./vo/event-registrations.vo.js";

// The fields the member's event registration form sends; the fee, payment
// status, registration status (REGISTERED; attendance is the organisers') and
// registrant are the server's, the rest is admin-only.
const MEMBER_FIELDS = ["eventId", "familyId", "memberIds", "memberNames", "registrantName"] as const;

export const ALREADY_REGISTERED = "Your family is already registered for this event.";
export const REGISTRATION_CLOSED = "Registration for this event is closed.";
export const REGISTRATION_NOT_OPEN = "Registration for this event has not opened yet.";

// "<event id>:<family id>" while a registration is live (not CANCELLED): the unique key allows one per family and event.
export const activeKeyOf = (eventId: string | null | undefined, familyId: string | null | undefined, status: string | null | undefined): string | null =>
  eventId && familyId && status !== "CANCELLED" ? `${eventId}:${familyId}` : null;

// Whether an event takes registrations at this moment: inside its registration window (when one is set) and not after
// the event day (dates are UTC calendar days).
export const registrationWindowError = (
  event: { date: Date; registrationOpen: Date | null; registrationClose: Date | null },
  now = new Date(),
): string | null => {
  if (event.registrationOpen && now < event.registrationOpen) return REGISTRATION_NOT_OPEN;
  if (event.registrationClose && now > event.registrationClose) return REGISTRATION_CLOSED;
  if (now.toISOString().slice(0, 10) > event.date.toISOString().slice(0, 10)) return REGISTRATION_CLOSED;
  return null;
};

// Members register their own family's members for an event. In one
// transaction: the registration (fee computed from the event), its payment
// (no gateway: PENDING for admins to reconcile, SUCCESS when free) and the
// family's confirmation notification.
@Injectable()
export class EventRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EventRegistrationsRepository,
    private readonly membership: MembershipRepository,
    private readonly events: EventsRepository,
    private readonly familyMembers: FamilyMembersRepository,
    private readonly transactions: TransactionsRepository,
    private readonly notifications: NotificationsRepository,
  ) {}

  async list(query: EventRegistrationListQueryDto): Promise<EventRegistrationVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toEventRegistrationVo);
  }

  async create(dto: CreateEventRegistrationDto, user: UserRow): Promise<EventRegistrationVo> {
    const { lang, ...body } = dto;
    if (user.role === "admin") return toEventRegistrationVo(await this.prisma.$transaction((tx) => this.insert(body, tx)));
    const input = pick(body, MEMBER_FIELDS);
    assertNoMarkup(input);
    const familyId = await this.membership.ownFamilyId(user);
    if (!familyId || input.familyId !== familyId) throw new ApiError(403, "You can only register your own family for events.");
    const memberIds = Array.isArray(input.memberIds) ? [...new Set(input.memberIds as unknown[])] : [];
    if (!memberIds.length) throw new ApiError(400, "Choose at least one family member to register.");
    const own = new Set(await this.membership.memberIdsOfFamily(familyId));
    if (!memberIds.every((id) => own.has(id as string))) throw new ApiError(403, "You can only register members of your own family.");
    if (await this.repo.activeExists(familyId, input.eventId)) throw new ApiError(409, ALREADY_REGISTERED);
    const row = await this.prisma
      .$transaction(async (tx) => {
        const event = await this.events.feeOf(input.eventId, tx);
        // Drafts and archived events aren't open to members.
        if (event?.status !== "PUBLISHED") throw new ApiError(404, "Event not found.");
        const closed = registrationWindowError(event);
        if (closed) throw new ApiError(409, closed);
        const totalFee = event.fee * memberIds.length;
        const paymentStatus = totalFee === 0 ? "SUCCESS" : "PENDING";
        const registration = await this.insert(
          {
            ...input,
            memberIds,
            status: "REGISTERED",
            eventTitle: event.title,
            count: memberIds.length,
            feePerMember: event.fee,
            totalFee,
            paymentStatus,
            registeredById: user.id,
            registrantEmail: user.email,
          },
          tx,
        );
        const firstMember = memberIds.length ? await this.familyMembers.findById(memberIds[0] as string, tx) : null;
        const payment = await createWithDisplayId(
          "TXN-",
          (prefix) => this.transactions.latestDisplayIds(prefix, tx),
          (transactionId) =>
            this.transactions.create(
              {
                id: randomId(),
                transactionId,
                type: "Event Registration",
                amount: totalFee,
                paymentMethod: "UPI",
                paymentStatus,
                eventId: input.eventId,
                familyId,
                memberId: firstMember?.membershipId,
                referenceId: registration.registrationId,
                date: new Date(),
                remarks: `Event: ${event.title} | Members: ${memberIds.length}`,
              },
              tx,
            ),
        );
        await this.notifications.create(workflowNotification("eventRegistered", familyId, { eventTitle: event.title }, lang), tx);
        return (await this.repo.update(registration.id, { transactionId: payment.transactionId }, tx)) ?? registration;
      })
      // Simultaneous requests: the live-registration key lets exactly one through.
      .catch((error: unknown) => {
        throw isUniqueViolation(error) ? new ApiError(409, ALREADY_REGISTERED) : error;
      });
    return toEventRegistrationVo(row);
  }

  async update(id: string, dto: UpdateEventRegistrationDto): Promise<EventRegistrationVo> {
    const current = await this.repo.findById(id);
    if (!current) throw new ApiError(404, "Record not found");
    const data = toUpdateData(dto);
    const activeKey = activeKeyOf(
      dto.eventId ?? current.eventId,
      dto.familyId !== undefined ? dto.familyId : current.familyId,
      dto.status !== undefined ? dto.status : current.status,
    );
    const row = await this.repo.update(id, { ...data, activeKey }).catch((error: unknown) => {
      throw isUniqueViolation(error) ? new ApiError(409, "This family already has another registration for this event.") : error;
    });
    if (!row) throw new ApiError(404, "Record not found");
    return toEventRegistrationVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  private insert(input: Omit<CreateEventRegistrationDto, "lang">, tx: Db) {
    return createWithDisplayId(
      "EVT-REG-",
      (prefix) => this.repo.latestDisplayIds(prefix, tx),
      (registrationId) =>
        this.repo.create(
          {
            id: randomId(),
            registrationId,
            registeredDate: new Date(),
            ...toCreateData(input),
            activeKey: activeKeyOf(input.eventId, input.familyId, input.status),
          },
          tx,
        ),
    );
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: Omit<CreateEventRegistrationDto, "lang">): Omit<Prisma.EventRegistrationUncheckedCreateInput, "id" | "registrationId"> => ({
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
