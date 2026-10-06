import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import type { EventsRepository } from "../events/events.repository.js";
import type { FamilyMembersRepository } from "../family-members/family-members.repository.js";
import type { MembershipRepository } from "../membership/membership.repository.js";
import type { NotificationsRepository } from "../notifications/notifications.repository.js";
import { FAM, fakeEvents, fakeMembership, fakeModelRepo, fakePrisma } from "../testing/fake-repo.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import { eventRegistrationRow, familyMemberRow, notificationRow, transactionRow } from "../testing/rows.js";
import type { TransactionsRepository } from "../transactions/transactions.repository.js";
import type { CreateEventRegistrationDto } from "./dto/event-registrations.dto.js";
import type { EventRegistrationsRepository } from "./event-registrations.repository.js";
import { EventRegistrationsService } from "./event-registrations.service.js";

const member = () => user({ id: "u-m", email: "member@example.com" });
const build = () => {
  const repo = fakeModelRepo(eventRegistrationRow);
  const transactions = fakeModelRepo(transactionRow);
  const notifications = fakeModelRepo(notificationRow);
  const familyMembers = fakeModelRepo(familyMemberRow, [familyMemberRow({ id: "m-own", familyId: FAM, membershipId: "NPSI-MEM-000001" })]);
  const service = new EventRegistrationsService(
    as<PrismaService>(fakePrisma()),
    as<EventRegistrationsRepository>(repo),
    as<MembershipRepository>(fakeMembership()),
    as<EventsRepository>(fakeEvents()),
    as<FamilyMembersRepository>(familyMembers),
    as<TransactionsRepository>(transactions),
    as<NotificationsRepository>(notifications),
  );
  return { service, repo, transactions, notifications };
};
const registration = (overrides: Partial<CreateEventRegistrationDto> = {}): CreateEventRegistrationDto => ({
  eventId: "ev",
  familyId: FAM,
  memberIds: ["m-own"],
  ...overrides,
});

describe("EventRegistrationsService.create (members)", () => {
  test("registration, payment and notification together; fee from the event; client fee fields ignored", async () => {
    const { service, transactions, notifications } = build();
    const created = await service.create(
      registration({ feePerMember: 0, totalFee: 0, paymentStatus: "SUCCESS", registrantEmail: "x@y.z", lang: "hi" }),
      member(),
    );
    assert.deepEqual(
      [created.registrationId, created.eventTitle, created.count, created.feePerMember, created.totalFee, created.paymentStatus, created.registeredById],
      ["EVT-REG-000001", "Garba", 1, 250, 250, "PENDING", "u-m"],
    );
    assert.equal(created.registrantEmail, "member@example.com");
    const [payment] = transactions.stored;
    assert.deepEqual(
      [payment.type, payment.amount.toNumber(), payment.paymentStatus, payment.familyId, payment.memberId, payment.referenceId],
      ["Event Registration", 250, "PENDING", FAM, "NPSI-MEM-000001", "EVT-REG-000001"],
    );
    assert.equal(created.transactionId, payment.transactionId);
    assert.deepEqual([notifications.stored[0].recipientFamilyId, notifications.stored[0].type], [FAM, "Event"]);
    assert.match(notifications.stored[0].message, /Garba/);
  });
  test("free events are paid at once", async () => {
    const { service, transactions } = build();
    const created = await service.create(registration({ eventId: "free" }), member());
    assert.deepEqual([created.paymentStatus, transactions.stored[0].paymentStatus], ["SUCCESS", "SUCCESS"]);
  });
  test("only their own family and its members, a real event, no markup", async () => {
    const { service, transactions } = build();
    await rejectsWith(service.create(registration({ familyId: "OTHER" }), member()), 403, "You can only register your own family for events.");
    await rejectsWith(service.create(registration(), user()), 403, "You can only register your own family for events.");
    await rejectsWith(service.create(registration({ memberIds: ["m-other"] }), member()), 403, "You can only register members of your own family.");
    await rejectsWith(service.create(registration({ eventId: "nope" }), member()), 404, "Event not found.");
    await rejectsWith(service.create(registration({ registrantName: "<b>" }), member()), 400, 'The "registrantName" field cannot contain < or > characters.');
    assert.equal(transactions.stored.length, 0);
  });
});

describe("EventRegistrationsService (admins)", () => {
  test("create as sent, without a payment or notification; list, update, remove", async () => {
    const { service, transactions, notifications } = build();
    const created = await service.create(registration({ familyId: "OTHER", totalFee: 5, registrantEmail: "a@b.c" }), admin());
    assert.deepEqual([created.familyId, created.totalFee, created.registrantEmail], ["OTHER", 5, "a@b.c"]);
    assert.deepEqual([transactions.stored.length, notifications.stored.length], [0, 0]);
    assert.equal((await service.list({ order: "-registeredDate", limit: 200 })).length, 1);
    assert.equal((await service.update(created.id, { status: "CANCELLED" })).status, "CANCELLED");
    await rejectsWith(service.update("missing", {}), 404, "Record not found");
    await service.remove(created.id);
  });
});
