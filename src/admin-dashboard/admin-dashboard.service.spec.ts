import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { as } from "../testing/fakes.js";
import { AdminDashboardService } from "./admin-dashboard.controller.js";

const NOW = new Date("2026-11-19T10:00:00Z");
const money = (value: number) => new Prisma.Decimal(value);

describe("AdminDashboardService.charts", () => {
  test("12 months oldest first; received / pending / other amounts per month; users and registrations counted per month", async () => {
    const transactions = [
      { amount: money(500), paymentStatus: "VERIFIED", type: "Registration Fee", date: new Date("2026-11-02T00:00:00Z"), createdAt: NOW },
      { amount: money(250), paymentStatus: "PENDING", type: "Event Registration", date: new Date("2026-11-03T00:00:00Z"), createdAt: NOW },
      { amount: money(100), paymentStatus: "REFUNDED", type: "Registration Fee", date: null, createdAt: new Date("2026-10-05T00:00:00Z") },
      { amount: money(999), paymentStatus: "SUCCESS", type: "Donation", date: new Date("2024-01-01T00:00:00Z"), createdAt: NOW },
    ];
    const db = {
      transaction: { findMany: mock.fn(async (args: { select: { type?: boolean } }) => (args.select.type ? transactions : transactions.slice(0, 3))) },
      user: {
        findMany: mock.fn(async () => [{ createdAt: new Date("2026-11-01T00:00:00Z") }, { createdAt: new Date("2026-06-15T00:00:00Z") }]),
        count: mock.fn(async () => 7),
      },
      application: { findMany: mock.fn(async () => [{ createdAt: NOW, submittedDate: new Date("2026-09-09T00:00:00Z") }]) },
      studentApplication: { findMany: mock.fn(async () => []) },
    };
    const charts = await new AdminDashboardService(as<PrismaService>(db)).charts(NOW);
    assert.equal(charts.transactions.length, 12);
    assert.deepEqual([charts.transactions[0].month, charts.transactions[11].month], ["2025-12", "2026-11"]);
    assert.deepEqual(charts.transactions[11], { month: "2026-11", received: 500, pending: 250, other: 0, count: 2 });
    assert.deepEqual(charts.transactions[10], { month: "2026-10", received: 0, pending: 0, other: 100, count: 1 });
    assert.deepEqual(charts.transactionTypes[0], { name: "Donation", value: 999, count: 1 }, "received only, biggest first");
    assert.equal(charts.transactionTypes.find((slice) => slice.name === "Registration Fee")?.value, 500);
    assert.equal(charts.users.find((point) => point.month === "2026-06")?.count, 1);
    assert.equal(charts.familyRegistrations.find((point) => point.month === "2026-09")?.count, 1);
    assert.deepEqual(charts.userTotals, { total: 7, active: 7, verified: 7, admins: 7 });
  });
});
