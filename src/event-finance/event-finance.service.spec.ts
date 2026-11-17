import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import { admin, as, user } from "../testing/fakes.js";
import { EventFinanceService } from "./event-finance.service.js";

const EVENT = { id: "ev-1", title: "Maa Na Garba", status: "PUBLISHED", date: new Date("2026-10-12T00:00:00Z") };
const decimal = (n: number) => ({ toNumber: () => n });
const contribution = (o: Record<string, unknown> = {}) => ({
  id: "c-1",
  serialNo: 43,
  contributionGroup: "GENERAL",
  notes: "Imported",
  reviewNote: "Check the amount",
  memberId: null,
  memberName: "Smt. Archana Lakhan Patidar",
  familyId: "NPSI-FAM-1",
  village: "Gheghav",
  mobile: "9876543210",
  amount: decimal(5100),
  paymentMode: "CASH",
  paymentReference: "UPI-1",
  status: "APPROVED",
  contributedAt: EVENT.date,
  ...o,
});
const expense = {
  id: "e-1",
  title: "Publicity",
  titleHi: "प्रचार-प्रसार",
  expenseGroup: "EVENT",
  serialNo: 1,
  amount: decimal(84781),
  importKey: "maa-na-garba-2026:E:EVENT:1",
  createdById: "u-admin",
  updatedById: "u-admin",
  approvedById: "u-admin",
  category: { id: "cat-1", name: "Flex", nameHi: "फ्लेक्स" },
};

const build = () => {
  const writes: Record<string, unknown>[] = [];
  const db = {
    event: { findUnique: mock.fn(async () => EVENT) },
    family: { findFirst: mock.fn(async () => ({ id: "f-1", familyId: "NPSI-FAM-9" })) },
    eventContribution: {
      aggregate: mock.fn(async (args: { where: { status: string } }) =>
        args.where.status === "APPROVED"
          ? { _sum: { amount: decimal(1232977) }, _count: { id: 187 } }
          : { _sum: { amount: decimal(15300) }, _count: { id: 3 } },
      ),
      findMany: mock.fn(async () => [contribution()]),
      groupBy: mock.fn(async (args: { by: string[] }) =>
        args.by[0] === "contributionGroup"
          ? [
              { contributionGroup: "GENERAL", _sum: { amount: decimal(1109477) } },
              { contributionGroup: "BHOG_PRASAD", _sum: { amount: decimal(123500) } },
            ]
          : [{ village: "Gheghav", _sum: { amount: decimal(5100) }, _count: { id: 1 } }],
      ),
      findFirst: mock.fn(async () => contribution()),
      update: mock.fn(async (args: { data: Record<string, unknown> }) => {
        writes.push(args.data);
        return { ...contribution(), ...args.data, amount: decimal(5100) };
      }),
      create: mock.fn(async (args: { data: Record<string, unknown> }) => ({ ...args.data, amount: decimal(5100) })),
    },
    eventExpense: {
      aggregate: mock.fn(async (args: { where: { status: string } }) =>
        args.where.status === "APPROVED" ? { _sum: { amount: decimal(1098185) }, _count: { id: 11 } } : { _sum: { amount: null }, _count: { id: 0 } },
      ),
      findMany: mock.fn(async () => [expense]),
      groupBy: mock.fn(async (args: { by: string[] }) =>
        args.by[0] === "expenseGroup"
          ? [
              { expenseGroup: "EVENT", _sum: { amount: decimal(899529) } },
              { expenseGroup: "ORGANIZATION", _sum: { amount: decimal(198656) } },
            ]
          : [{ categoryId: "cat-1", _sum: { amount: decimal(84781) } }],
      ),
    },
    expenseCategory: { findMany: mock.fn(async () => [{ id: "cat-1", name: "Flex", nameHi: "फ्लेक्स" }]) },
    familyMember: { findUnique: mock.fn(async () => null) },
    eventFinancialAuditLog: {
      create: mock.fn(async () => ({})),
      findMany: mock.fn(async () => [{ id: "a-1", eventId: "ev-1", actorId: "u-admin", entityType: "EXPENSE", entityId: "e-1", action: "IMPORT" }]),
    },
    user: { findMany: mock.fn(async () => [{ id: "u-admin", fullName: "Super Admin", email: "admin@example.com" }]) },
    $transaction: mock.fn(async <T>(work: (tx: unknown) => Promise<T>) => work(db)),
  };
  return { service: new EventFinanceService(as<PrismaService>(db)), db, writes };
};

describe("EventFinanceService statement roster", () => {
  test("summary totals come from the records, split into Sahyog / Bhog-Prasad and event / Sangathan expenses", async () => {
    const { service } = build();
    const { summary, categoryTotals } = await service.detail("ev-1", admin());
    assert.equal(summary.totalCollection, 1232977);
    assert.equal(summary.totalExpenses, 1098185);
    assert.equal(summary.remainingBalance, 134792);
    assert.deepEqual(summary.contributionGroups, { GENERAL: 1109477, BHOG_PRASAD: 123500 });
    assert.deepEqual(summary.expenseGroups, { EVENT: 899529, ORGANIZATION: 198656 });
    assert.equal(summary.pendingContributions, 15300);
    assert.deepEqual(categoryTotals[0], { categoryId: "cat-1", category: "Flex", categoryHi: "फ्लेक्स", amount: 84781 });
  });

  test("members see serial number, group and amount, never the review note, family id, payment reference, full mobile or import bookkeeping", async () => {
    const { service } = build();
    const { contributions, expenses } = await service.detail("ev-1", user());
    const [row] = contributions as Record<string, unknown>[];
    assert.equal(row.serialNo, 43);
    assert.equal(row.contributionGroup, "GENERAL");
    assert.equal(row.mobile, "******3210");
    for (const hidden of ["reviewNote", "familyId", "paymentReference"]) assert.equal(row[hidden], undefined, hidden);
    const [line] = expenses as Record<string, unknown>[];
    assert.equal(line.titleHi, "प्रचार-प्रसार");
    for (const hidden of ["importKey", "createdById", "updatedById", "approvedById"]) assert.equal(line[hidden], undefined, hidden);
    const adminView = (await service.detail("ev-1", admin())).expenses[0] as Record<string, unknown>;
    assert.equal(adminView.importKey, "maa-na-garba-2026:E:EVENT:1");
  });

  test("an edit that leaves out the statement fields keeps them; an empty review note clears it", async () => {
    const { service, writes } = build();
    const base = { memberName: "Smt. Archana Lakhan Patidar", amount: 5100, paymentMode: "CASH" };
    await service.saveContribution("ev-1", base, admin(), "c-1");
    assert.equal(writes[0].serialNo, undefined);
    assert.equal(writes[0].reviewNote, undefined);
    assert.equal(writes[0].notes, undefined);
    await service.saveContribution("ev-1", { ...base, reviewNote: "", status: "APPROVED" }, admin(), "c-1");
    assert.equal(writes[1].reviewNote, null);
    assert.equal(writes[1].status, "APPROVED");
  });

  test("history lists who changed what, with the admin's name", async () => {
    const { service } = build();
    const [row] = await service.history("ev-1");
    assert.equal(row.action, "IMPORT");
    assert.equal(row.actorName, "Super Admin");
  });
});
