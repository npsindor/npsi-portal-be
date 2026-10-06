import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { UserRow } from "../common/session/session.service.js";
import type { MembershipRepository } from "../membership/membership.repository.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import type { CreateNotificationDto } from "./dto/notification.dto.js";
import type { NotificationsRepository } from "./notifications.repository.js";
import { NotificationsService } from "./notifications.service.js";

const FAM = "NPSI-FAM-000001";
const member = () => user({ id: "u-m", email: "member@example.com" });
const CREATED = new Date("2026-01-01T00:00:00Z");

type Row = Record<string, unknown>;
const dbRow = (data: Row): Row => ({ recipientFamilyId: null, read: false, date: null, deepLink: null, createdAt: CREATED, updatedAt: CREATED, ...data });

const build = () => {
  const stored: Row[] = [];
  const repo = {
    stored,
    list: mock.fn(async (..._args: unknown[]) => [dbRow({ id: "n1", title: "T", message: "M", type: "Event", read: true })]),
    findById: mock.fn(async (id: string) => (id === "gone" ? null : dbRow({ id, title: "T", message: "M", type: "Event" }))),
    // "n-own" is the member's family's, "n-all" a broadcast, "n-blank" an old empty-recipient broadcast.
    recipientOf: mock.fn(
      async (id: string) =>
        ({
          "n-own": { recipientFamilyId: FAM },
          "n-all": { recipientFamilyId: null },
          "n-blank": { recipientFamilyId: "" },
          "n-other": { recipientFamilyId: "OTHER" },
        })[id] ?? null,
    ),
    exists: mock.fn(async (recipient: string) => recipient === "APP-DONE"),
    create: mock.fn(async (data: Row) => {
      stored.push(data);
      return dbRow(data);
    }),
    createMany: mock.fn(async (rows: Row[]) => {
      stored.push(...rows);
      return rows.map(dbRow);
    }),
    update: mock.fn(async (..._args: unknown[]) => undefined),
    delete: mock.fn(async (..._args: unknown[]) => undefined),
  };
  // "APP-NEW"/"APP-DONE" are applications submitted moments ago; "APP-DONE" was already notified.
  const membership = {
    ownFamilyId: mock.fn(async (u: UserRow | null) => (u?.id === "u-m" ? FAM : null)),
    recentApplicationKind: mock.fn(async (id: unknown) => (id === "APP-NEW" || id === "APP-DONE" ? "Application" : null)),
    recentTransferTo: mock.fn(async (userId: string, familyId: string) => userId === "u-m" && familyId === "TARGET"),
  };
  return { service: new NotificationsService(as<NotificationsRepository>(repo), as<MembershipRepository>(membership)), repo };
};

const notice = (overrides: Partial<CreateNotificationDto> = {}): CreateNotificationDto => ({ title: "T", message: "M", type: "Event", ...overrides });

describe("NotificationsService.list", () => {
  test("maps rows to the camelCase API shape", async () => {
    assert.deepEqual(await build().service.list(admin(), {}), [
      {
        id: "n1",
        title: "T",
        message: "M",
        type: "Event",
        recipientFamilyId: null,
        read: true,
        date: null,
        deepLink: null,
        createdAt: CREATED,
        updatedAt: CREATED,
      },
    ]);
  });
  test("order and limit; newest first by default", async () => {
    const { service, repo } = build();
    await service.list(admin(), { order: "-date", limit: 5 });
    await service.list(admin(), { order: "createdAt" });
    await service.list(admin(), {});
    assert.deepEqual(
      repo.list.mock.calls.map((call) => call.arguments),
      [
        [null, { date: "desc" }, 5],
        [null, { createdAt: "asc" }, 100],
        [null, { createdAt: "desc" }, 100],
      ],
    );
  });
  test("members get their family plus broadcasts; without a family, only broadcasts", async () => {
    const { service, repo } = build();
    await service.list(member(), {});
    await service.list(user({ id: "u-x" }), {});
    assert.deepEqual(
      repo.list.mock.calls.map((call) => call.arguments[0]),
      [FAM, "__none__"],
    );
  });
});

describe("NotificationsService.create", () => {
  test("admins: anything; a blank recipient becomes a broadcast; ids are always the server's", async () => {
    const { service, repo } = build();
    await service.create(notice({ recipientFamilyId: " ", deepLink: "/events", read: true, date: "2026-02-01T10:00:00.000Z" }), admin());
    const { id, ...row } = repo.stored[0];
    assert.equal(typeof id, "string");
    assert.deepEqual(row, {
      title: "T",
      message: "M",
      type: "Event",
      recipientFamilyId: null,
      read: true,
      date: new Date("2026-02-01T10:00:00.000Z"),
      deepLink: "/events",
    });
  });
  test("anonymous: only the one notice for a just-submitted application; type, link and read are the server's", async () => {
    const { service, repo } = build();
    await rejectsWith(service.create(notice(), null), 403, "Only admins can send notifications to everyone.");
    const created = await service.create(notice({ type: "Alert", recipientFamilyId: " APP-NEW ", deepLink: "https://evil", read: true }), null);
    assert.equal(created.type, "Registration");
    const row = repo.stored[0];
    assert.deepEqual([row.recipientFamilyId, row.type, row.deepLink, row.read], ["APP-NEW", "Registration", undefined, undefined]);
    await rejectsWith(service.create(notice({ recipientFamilyId: "APP-DONE" }), null), 409, "This application has already been notified.");
    await rejectsWith(service.create(notice({ recipientFamilyId: FAM }), null), 403, "You can't send a notification to this family.");
    await rejectsWith(service.create(notice({ title: "<b>", recipientFamilyId: "APP-NEW" }), null), 400, 'The "title" field cannot contain < or > characters.');
  });
  test("members: own family or a just-requested transfer target only", async () => {
    const { service, repo } = build();
    await service.create(notice({ recipientFamilyId: FAM }), member());
    await service.create(notice({ type: "Approval", recipientFamilyId: "TARGET" }), member());
    assert.deepEqual(
      repo.stored.map((row) => [row.recipientFamilyId, row.type]),
      [
        [FAM, "Event"],
        ["TARGET", "Approval"],
      ],
    );
    await rejectsWith(service.create(notice({ recipientFamilyId: "OTHER" }), member()), 403, "You can't send a notification to this family.");
  });
});

describe("NotificationsService.createBatch", () => {
  test("nothing to create is a 200 with []", async () => {
    assert.deepEqual(await build().service.createBatch(undefined), { status: 200, records: [] });
    assert.deepEqual(await build().service.createBatch([]), { status: 200, records: [] });
  });
  test("creates all in one call; blank recipients become broadcasts", async () => {
    const { service, repo } = build();
    const result = await service.createBatch([notice({ recipientFamilyId: "" }), notice({ recipientFamilyId: FAM })]);
    assert.equal(result.status, 201);
    assert.equal(repo.createMany.mock.callCount(), 1);
    assert.deepEqual(
      repo.stored.map((row) => row.recipientFamilyId),
      [null, FAM],
    );
  });
});

describe("NotificationsService.update", () => {
  test("members may only mark their own or broadcast notifications read", async () => {
    const { service, repo } = build();
    await rejectsWith(service.update("n-other", { read: true }, member()), 403, "You can only update your own notifications.");
    await rejectsWith(service.update("n-missing", { read: true }, member()), 403, "You can only update your own notifications.");
    for (const id of ["n-own", "n-all", "n-blank"]) await service.update(id, { read: true, title: "ignored" }, member());
    assert.deepEqual(
      repo.update.mock.calls.map((call) => [call.arguments[0], (call.arguments[1] as Row).read, (call.arguments[1] as Row).title]),
      [
        ["n-own", true, undefined],
        ["n-all", true, undefined],
        ["n-blank", true, undefined],
      ],
    );
    await service.update("n-own", { title: "only a title" }, member());
    assert.equal(repo.update.mock.callCount(), 3);
  });
  test("admins: any field, blank recipient becomes a broadcast; 404 when it doesn't exist", async () => {
    const { service, repo } = build();
    await service.update("n-other", { title: "T", recipientFamilyId: "" }, admin());
    const data = repo.update.mock.calls[0].arguments[1] as Row;
    assert.deepEqual([data.title, data.recipientFamilyId, data.message], ["T", null, undefined]);
    await rejectsWith(service.update("gone", { title: "T" }, admin()), 404, "Record not found");
  });
});

describe("NotificationsService.remove", () => {
  test("deletes by id", async () => {
    const { service, repo } = build();
    await service.remove("n1");
    assert.deepEqual(repo.delete.mock.calls[0].arguments, ["n1"]);
  });
});
