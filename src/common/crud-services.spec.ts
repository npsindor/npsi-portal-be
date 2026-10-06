import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AnnouncementsService } from "../announcements/announcements.service.js";
import { CreateEventDto } from "../events/dto/events.dto.js";
import { EventsService } from "../events/events.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrinciplesService } from "../principles/principles.service.js";
import { RulesService } from "../rules/rules.service.js";
import { SamitiMembersService } from "../samiti-members/samiti-members.service.js";
import { SamitisService } from "../samitis/samitis.service.js";
import { StudentsService } from "../students/students.service.js";
import { fakeModelRepo } from "../testing/fake-repo.js";
import { as, rejectsWith, user } from "../testing/fakes.js";
import { announcementRow, eventRow, principleRow, ruleRow, samitiMemberRow, samitiRow, studentRow } from "../testing/rows.js";
import { orderValues, toOrderBy } from "./dto/list-query.dto.js";
import { parseDate, toDateOnly } from "./utils/dates.js";
import { createWithDisplayId, nextDisplayId } from "./utils/display-ids.js";
import { toJsonInput } from "./utils/json.js";
import { assertNoMarkup } from "./utils/markup.js";
import { pick } from "./utils/objects.js";

interface Crud {
  list(query: object): Promise<{ id: string }[]>;
  create(dto: object): Promise<{ id: string }>;
  update(id: string, dto: object): Promise<{ id: string }>;
  remove(id: string): Promise<void>;
}

// Each plain admin-managed resource: a minimal valid create body and a field to update.
const CASES: [string, (repo: object) => Crud, (data: object) => { id: string }, object, object][] = [
  ["announcements", (r) => as<Crud>(new AnnouncementsService(as(r))), announcementRow, { title: "T", body: "B" }, { status: "Archived" }],
  ["events", (r) => as<Crud>(new EventsService(as(r))), eventRow, { title: "T", date: "2026-12-01", venue: "Hall", fee: 100 }, { capacity: 50 }],
  [
    "principles",
    (r) => as<Crud>(new PrinciplesService(as(r))),
    principleRow,
    { titleEn: "T", titleHi: "T", contentEn: "C", contentHi: "C" },
    { sectionNumber: 2 },
  ],
  ["rules", (r) => as<Crud>(new RulesService(as(r))), ruleRow, { titleEn: "T", titleHi: "T", contentEn: "C", contentHi: "C" }, { sectionNumber: 3 }],
  ["samitis", (r) => as<Crud>(new SamitisService(as(r))), samitiRow, { name: "S", formedDate: "2020-01-02" }, { status: "Inactive" }],
  ["samiti-members", (r) => as<Crud>(new SamitiMembersService(as(r))), samitiMemberRow, { samitiId: "s1", name: "N" }, { position: "Head" }],
  ["students", (r) => as<Crud>(new StudentsService(as(r))), studentRow, { studentName: "S" }, { status: "ACTIVE" }],
];

describe("plain CRUD services", () => {
  for (const [name, make, row, body, change] of CASES) {
    test(`${name}: create, list, update (404 when missing), remove`, async () => {
      const repo = fakeModelRepo(row as (data: Partial<{ id: string }>) => { id: string });
      const service = make(repo);
      const created = await service.create(body);
      assert.equal(typeof created.id, "string");
      assert.equal((await service.list({ order: "-createdAt", limit: 10 })).length, 1);
      const updated = await service.update(created.id, change);
      for (const [field, value] of Object.entries(change)) assert.equal((updated as unknown as Record<string, unknown>)[field], value);
      await rejectsWith(service.update("missing", change), 404, "Record not found");
      await service.remove(created.id);
      assert.deepEqual(repo.delete.mock.calls[0].arguments, [created.id]);
    });
  }
  test("API shape: decimals as numbers, DATE columns as YYYY-MM-DD", async () => {
    const repo = fakeModelRepo(eventRow);
    const created = (await new EventsService(as(repo)).create({ title: "T", date: "2026-12-01", venue: "Hall", fee: 99.5 } as never)) as unknown as Record<
      string,
      unknown
    >;
    assert.deepEqual([created.fee, created.date], [99.5, "2026-12-01"]);
    assert.ok(repo.stored[0].fee instanceof Prisma.Decimal || typeof repo.stored[0].fee === "number");
  });
  test("events and announcements: visitors and members get published/active ones, admins everything", async () => {
    for (const [service, repo, visible] of [
      ...[fakeModelRepo(eventRow)].map((r) => [new EventsService(as(r)), r, "PUBLISHED"] as const),
      ...[fakeModelRepo(announcementRow)].map((r) => [new AnnouncementsService(as(r)), r, "Active"] as const),
    ]) {
      await service.list({}, null);
      await service.list({}, user());
      await service.list({}, user({ role: "admin" }));
      assert.deepEqual(
        repo.list.mock.calls.map((call) => call.arguments[0]),
        [{ status: visible }, { status: visible }, {}],
      );
    }
  });
  test("an event with registrations can't be deleted", async () => {
    const repo = fakeModelRepo(eventRow);
    repo.hasRegistrations.mock.mockImplementation(async () => true);
    await rejectsWith(new EventsService(as(repo)).remove("ev-1"), 409, "This event has registrations, so it can't be deleted. Archive it instead.");
    assert.equal(repo.delete.mock.callCount(), 0);
  });
  test("samiti members filter by samiti; students get the next display id", async () => {
    const members = fakeModelRepo(samitiMemberRow);
    await new SamitiMembersService(as(members)).list({ samitiId: "s1" });
    assert.deepEqual(members.list.mock.calls[0].arguments[0], { samitiId: "s1" });
    const students = fakeModelRepo(studentRow);
    students.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-STU-000011"]);
    assert.equal(
      ((await new StudentsService(as(students)).create({ studentName: "S" } as never)) as unknown as { studentId: string }).studentId,
      "NPSI-STU-000012",
    );
  });
});

describe("DTO validation", () => {
  const errors = async (body: object) =>
    (await validate(plainToInstance(CreateEventDto, body), { whitelist: true, stopAtFirstError: true })).flatMap((e) => Object.values(e.constraints ?? {}));
  test("required fields, form-style conversions, types", async () => {
    assert.deepEqual(await errors({ date: "2026-12-01", venue: "Hall" }), ["Title is required."]);
    assert.deepEqual(await errors({ title: "T", date: "", venue: "Hall" }), ["Date is required."]);
    assert.deepEqual(await errors({ title: "T", date: "2026-12-01", venue: "Hall", fee: "100", capacity: "", registrationOpen: "" }), []);
    assert.deepEqual(await errors({ title: "T", date: "2026-12-01", venue: "Hall", capacity: "many" }), ["capacity must be an integer number"]);
    const dto = plainToInstance(CreateEventDto, { title: 5, date: "2026-12-01", venue: "Hall", fee: "100", capacity: "", slug: "" });
    assert.deepEqual([dto.title, dto.fee, dto.capacity, dto.slug], ["5", 100, null, ""]);
  });
});

describe("shared helpers", () => {
  test("display ids: next after the highest numbered one; retry on a clash", async () => {
    assert.equal(nextDisplayId("NPSI-FAM-", ["NPSI-FAM-TEST", "NPSI-FAM-000023", null, "NPSI-FAM-000009"]), "NPSI-FAM-000024");
    assert.equal(nextDisplayId("FB-", []), "FB-000001");
    let attempts = 0;
    const id = await createWithDisplayId(
      "X-",
      async () => (attempts ? ["X-000001"] : []),
      async (displayId) => {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("dup"), { code: "P2002" });
        return displayId;
      },
    );
    assert.equal(id, "X-000002");
    await assert.rejects(
      createWithDisplayId(
        "X-",
        async () => [],
        async () => Promise.reject(new Error("db down")),
      ),
      /db down/,
    );
    await assert.rejects(
      createWithDisplayId(
        "X-",
        async () => [],
        async () => Promise.reject(Object.assign(new Error("dup"), { code: "P2002" })),
      ),
      /dup/,
    );
  });
  test("dates: zone-less date-times are UTC; DATE columns go out as YYYY-MM-DD", () => {
    assert.equal(parseDate("2026-01-31 10:00:00")?.toISOString(), "2026-01-31T10:00:00.000Z");
    assert.equal(parseDate("2026-01-31T10:00:00+05:30")?.toISOString(), "2026-01-31T04:30:00.000Z");
    assert.equal(parseDate("2026-01-31")?.toISOString(), "2026-01-31T00:00:00.000Z");
    assert.equal(parseDate(null), null);
    assert.equal(parseDate(undefined), undefined);
    assert.equal(toDateOnly(new Date("2026-01-31T00:00:00Z")), "2026-01-31");
    assert.equal(toDateOnly(null), null);
  });
  test("list order, JSON input, markup, pick", () => {
    assert.deepEqual(toOrderBy("-date"), [{ date: "desc" }, { id: "asc" }]);
    assert.deepEqual(toOrderBy("title"), [{ title: "asc" }, { id: "asc" }]);
    assert.deepEqual(orderValues(["a"] as const), ["a", "-a"]);
    assert.equal(toJsonInput(undefined), undefined);
    assert.equal(toJsonInput(null), Prisma.DbNull);
    assert.deepEqual(toJsonInput([1]), [1]);
    assert.throws(
      () => assertNoMarkup({ ok: "fine", name: "<x>" }),
      (e: { getResponse(): unknown }) => {
        assert.deepEqual(e.getResponse(), { error: 'The "name" field cannot contain < or > characters.' });
        return true;
      },
    );
    assert.deepEqual(pick({ a: 1, b: 2 } as { a: number; b: number; c?: number }, ["a", "c"]), { a: 1 });
  });
});
