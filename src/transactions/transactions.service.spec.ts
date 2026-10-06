import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fakeModelRepo } from "../testing/fake-repo.js";
import { as, rejectsWith } from "../testing/fakes.js";
import { transactionRow } from "../testing/rows.js";
import type { TransactionsRepository } from "./transactions.repository.js";
import { TransactionsService } from "./transactions.service.js";

const build = () => {
  const repo = fakeModelRepo(transactionRow);
  return { service: new TransactionsService(as<TransactionsRepository>(repo)), repo };
};

describe("TransactionsService (admins)", () => {
  test("create records what was sent, amounts as numbers, dates as UTC", async () => {
    const { service, repo } = build();
    const created = await service.create({ transactionId: "TX-1", type: "DONATION", amount: 500, paymentStatus: "SUCCESS", date: "2026-02-01" });
    assert.deepEqual([created.type, created.paymentStatus, created.amount], ["DONATION", "SUCCESS", 500]);
    assert.deepEqual(repo.stored[0].date, new Date("2026-02-01T00:00:00Z"));
  });
  test("list, update (404 when missing) and remove", async () => {
    const { service, repo } = build();
    await service.create({ transactionId: "TX-1", type: "x", amount: 1 });
    assert.equal((await service.list({ order: "-date", limit: 5 })).length, 1);
    assert.deepEqual(repo.list.mock.calls[0].arguments, [{}, { date: "desc" }, 5]);
    const id = repo.stored[0].id;
    assert.equal((await service.update(id, { remarks: "ok" })).remarks, "ok");
    await rejectsWith(service.update("missing", { remarks: "x" }), 404, "Record not found");
    await service.remove(id);
    assert.deepEqual(repo.delete.mock.calls[0].arguments, [id]);
  });
});
