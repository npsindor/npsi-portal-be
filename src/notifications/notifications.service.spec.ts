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
    create: mock.fn(async (data: Row) => {
      stored.push(data);
      return dbRow(data);
    }),
    createMany: mock.fn(async (rows: Row[]) => {
      stored.push(...rows);
      return rows.map(dbRow);
    }),
    update: mock.fn(async (..._args: unknown[]) => undefined),
    // Per-member read marks on broadcasts, as "userId|notificationId".
    reads: new Set<string>(),
    readBy: mock.fn(async function (this: { reads: Set<string> }, userId: string, ids: string[]) {
      return new Set(ids.filter((id) => this.reads.has(`${userId}|${id}`)));
    }),
    setReadBy: mock.fn(async function (this: { reads: Set<string> }, userId: string, id: string, read: boolean) {
      if (read) this.reads.add(`${userId}|${id}`);
      else this.reads.delete(`${userId}|${id}`);
    }),
    delete: mock.fn(async (..._args: unknown[]) => undefined),
  };
  const membership = {
    ownFamilyId: mock.fn(async (u: UserRow | null) => (u?.id === "u-m" ? FAM : null)),
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
        [null, [{ date: "desc" }, { id: "asc" }], 5, undefined],
        [null, [{ createdAt: "asc" }, { id: "asc" }], 100, undefined],
        [null, [{ createdAt: "desc" }, { id: "asc" }], 100, undefined],
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

describe("NotificationsService.create (admins)", () => {
  test("anything, server id, blank recipient becomes a broadcast", async () => {
    const { service, repo } = build();
    await service.create(notice({ recipientFamilyId: " ", deepLink: "/events", read: true, date: "2026-02-01T10:00:00.000Z" }));
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
    await service.create(notice({ recipientFamilyId: FAM }));
    assert.equal(repo.stored[1].recipientFamilyId, FAM);
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
  test("members mark their family's notifications read (shared by the family), only read, nothing else", async () => {
    const { service, repo } = build();
    await rejectsWith(service.update("n-other", { read: true }, member()), 403, "You can only update your own notifications.");
    await rejectsWith(service.update("n-missing", { read: true }, member()), 403, "You can only update your own notifications.");
    await service.update("n-own", { read: true, title: "ignored" }, member());
    assert.deepEqual(repo.update.mock.calls[0].arguments.slice(0, 2), [
      "n-own",
      { read: true, title: undefined, message: undefined, type: undefined, recipientFamilyId: undefined, date: undefined, deepLink: undefined },
    ]);
    await service.update("n-own", { title: "only a title" }, member());
    assert.equal(repo.update.mock.callCount(), 1);
  });
  test("broadcasts are read per member: marking one read doesn't change it for anyone else", async () => {
    const { service, repo } = build();
    const marked = await service.update("n-all", { read: true, title: "ignored" }, member());
    assert.equal(marked.read, true);
    assert.equal(repo.update.mock.callCount(), 0, "the shared row is untouched");
    assert.deepEqual([...repo.reads], ["u-m|n-all"]);
    repo.list.mock.mockImplementation(async () => [dbRow({ id: "n-all", title: "T", message: "M", type: "Event", read: false })]);
    assert.equal((await service.list(member(), {}))[0].read, true, "read for this member");
    assert.equal((await service.list(user({ id: "u-other" }), {}))[0].read, false, "still unread for another member");
    assert.equal((await service.update("n-blank", { read: true }, member())).read, true, "empty-recipient rows are broadcasts too");
    assert.equal((await service.update("n-all", { read: false }, member())).read, false, "and can be marked unread again");
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
