import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EventsRepository } from "../events/events.repository.js";
import type { MembershipRepository } from "../membership/membership.repository.js";
import { FAM, fakeEvents, fakeMembership, fakeModelRepo } from "../testing/fake-repo.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import { eventRegistrationRow } from "../testing/rows.js";
import type { CreateEventRegistrationDto } from "./dto/event-registrations.dto.js";
import type { EventRegistrationsRepository } from "./event-registrations.repository.js";
import { EventRegistrationsService } from "./event-registrations.service.js";

const member = () => user({ id: "u-m" });
const build = () => {
  const repo = fakeModelRepo(eventRegistrationRow);
  const service = new EventRegistrationsService(
    as<EventRegistrationsRepository>(repo),
    as<MembershipRepository>(fakeMembership()),
    as<EventsRepository>(fakeEvents()),
  );
  return { service, repo };
};
const registration = (overrides: Partial<CreateEventRegistrationDto> = {}): CreateEventRegistrationDto => ({
  registrationId: "R1",
  eventId: "ev",
  familyId: FAM,
  memberIds: ["m-own"],
  ...overrides,
});

describe("EventRegistrationsService.create", () => {
  test("members: fee computed from the event, paid events PENDING, admin-only fields dropped", async () => {
    const { service } = build();
    const created = await service.create(
      registration({ feePerMember: 0, totalFee: 0, paymentStatus: "SUCCESS", registeredById: "someone", registrantEmail: "dropped@x.y" }),
      member(),
    );
    assert.deepEqual(
      [created.feePerMember, created.totalFee, created.paymentStatus, created.registeredById, created.registrantEmail],
      [250, 250, "PENDING", "u-m", null],
    );
    const free = await service.create(registration({ registrationId: "R2", eventId: "free" }), member());
    assert.equal(free.paymentStatus, "SUCCESS");
  });
  test("members: only their own family and its members, a real event, no markup", async () => {
    const { service } = build();
    await rejectsWith(service.create(registration({ familyId: "OTHER" }), member()), 403, "You can only register your own family for events.");
    await rejectsWith(service.create(registration(), user()), 403, "You can only register your own family for events.");
    await rejectsWith(service.create(registration({ memberIds: ["m-other"] }), member()), 403, "You can only register members of your own family.");
    await rejectsWith(service.create(registration({ eventId: "nope" }), member()), 404, "Event not found.");
    await rejectsWith(service.create(registration({ eventTitle: "<b>" }), member()), 400, 'The "eventTitle" field cannot contain < or > characters.');
  });
  test("admins: as sent", async () => {
    const created = await build().service.create(registration({ familyId: "OTHER", totalFee: 5, registrantEmail: "a@b.c" }), admin());
    assert.deepEqual([created.familyId, created.totalFee, created.registrantEmail], ["OTHER", 5, "a@b.c"]);
  });
  test("list, update, remove", async () => {
    const { service } = build();
    const created = await service.create(registration(), admin());
    assert.equal((await service.list({ order: "-registeredDate", limit: 200 })).length, 1);
    assert.equal((await service.update(created.id, { status: "CANCELLED" })).status, "CANCELLED");
    await rejectsWith(service.update("missing", {}), 404, "Record not found");
    await service.remove(created.id);
  });
});
