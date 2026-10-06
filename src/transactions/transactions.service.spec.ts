import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EventsRepository } from "../events/events.repository.js";
import type { MembershipRepository } from "../membership/membership.repository.js";
import { FAM, fakeEvents, fakeMembership, fakeModelRepo } from "../testing/fake-repo.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import { transactionRow } from "../testing/rows.js";
import type { CreateTransactionDto } from "./dto/transactions.dto.js";
import type { TransactionsRepository } from "./transactions.repository.js";
import { TransactionsService } from "./transactions.service.js";

const member = () => user({ id: "u-m" });
const build = () => {
  const repo = { ...fakeModelRepo(transactionRow), existsForReference: async (ref: string) => ref === "APP-PAID" };
  const service = new TransactionsService(as<TransactionsRepository>(repo), as<MembershipRepository>(fakeMembership()), as<EventsRepository>(fakeEvents()));
  return { service, repo };
};
const tx = (overrides: Partial<CreateTransactionDto> = {}): CreateTransactionDto => ({ transactionId: "TX-1", type: "DONATION", amount: 500, ...overrides });

describe("TransactionsService.create", () => {
  test("admins record anything", async () => {
    const { service, repo } = build();
    const created = await service.create(tx({ paymentStatus: "SUCCESS", familyId: "F", date: "2026-02-01" }), admin());
    assert.deepEqual([created.type, created.paymentStatus, created.amount], ["DONATION", "SUCCESS", 500]);
    assert.deepEqual(repo.stored[0].date, new Date("2026-02-01T00:00:00Z"));
  });
  test("registration fee: a just-submitted application, once, always PENDING, nothing else attached", async () => {
    const { service } = build();
    const created = await service.create(tx({ referenceId: "APP-NEW", paymentStatus: "SUCCESS", familyId: "F", eventId: "ev", memberId: "M" }), null);
    assert.deepEqual(
      [created.type, created.paymentStatus, created.familyId, created.eventId, created.memberId],
      ["Family Registration", "PENDING", null, null, null],
    );
    await rejectsWith(service.create(tx({ referenceId: "APP-PAID" }), null), 409, "A registration fee is already recorded for this application.");
    await rejectsWith(service.create(tx({ referenceId: "STU-NEW" }), null), 403, "Payments can only be recorded for your own registration.");
    await rejectsWith(service.create(tx({ amount: -1, referenceId: "APP-NEW" }), null), 400, "Amount must be zero or more.");
    await rejectsWith(service.create(tx({ remarks: "<b>" }), null), 400, 'The "remarks" field cannot contain < or > characters.');
  });
  test("event fee: own family, real event, SUCCESS only when the event is free", async () => {
    const { service } = build();
    const paid = await service.create(tx({ eventId: "ev", familyId: "OTHER", amount: 0, paymentStatus: "SUCCESS", memberId: "NPSI-MEM-000001" }), member());
    const free = await service.create(tx({ transactionId: "TX-2", eventId: "free", amount: 0, paymentStatus: "SUCCESS" }), member());
    assert.deepEqual([paid.type, paid.familyId, paid.paymentStatus], ["Event Registration", FAM, "PENDING"]);
    assert.equal(free.paymentStatus, "SUCCESS");
    await rejectsWith(service.create(tx({ eventId: "nope" }), member()), 404, "Event not found.");
    await rejectsWith(service.create(tx({}), member()), 404, "Event not found.");
    await rejectsWith(service.create(tx({ eventId: "ev", memberId: "NPSI-MEM-000002" }), member()), 403, "You can only pay for members of your own family.");
    await rejectsWith(service.create(tx({ eventId: "ev" }), user()), 403, "No family found for your account.");
  });
});

describe("TransactionsService admin CRUD", () => {
  test("list, update (404 when missing) and remove", async () => {
    const { service, repo } = build();
    await service.create(tx(), admin());
    assert.equal((await service.list({ order: "-date", limit: 5 })).length, 1);
    assert.deepEqual(repo.list.mock.calls[0].arguments, [{}, { date: "desc" }, 5]);
    const id = repo.stored[0].id;
    assert.equal((await service.update(id, { remarks: "ok" })).remarks, "ok");
    await rejectsWith(service.update("missing", { remarks: "x" }), 404, "Record not found");
    await service.remove(id);
    assert.deepEqual(repo.delete.mock.calls[0].arguments, [id]);
  });
});
