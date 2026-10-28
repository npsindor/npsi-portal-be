import assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ApiError } from "../common/filters/api-error.js";
import type { MailService } from "../common/mail/mail.service.js";
import type { UserRow } from "../common/session/session.service.js";
import type { AppConfigService } from "../config/app-config.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { CreateSafarDto } from "./safar.dto.js";
import { compatibleType, routeKey, validTravelDate } from "./safar.rules.js";
import { SafarService } from "./safar.service.js";

// biome-ignore lint/suspicious/noExplicitAny: This isolated Prisma double accepts heterogeneous query ASTs.
type Row = Record<string, any>;
const rowById = (rows: Row[], id: string): Row => {
  const row = rows.find((value) => value.id === id);
  assert.ok(row);
  return row;
};
const user = (id: string) =>
  ({ id, email: `${id}@example.invalid`, phone: "9000000000", fullName: id, role: "user", status: "active", isVerified: true }) as UserRow;
const request = (kind = "REQUEST", key = crypto.randomUUID()): CreateSafarDto => ({
  clientRequestId: key,
  kind,
  requestType: kind === "OFFER" ? "BOTH" : "TRAVEL",
  name: "Test Member",
  phone: "9000000000",
  origin: "इंदौर",
  destination: "Khargone",
  travelDate: "2099-11-29",
  preferredTime: "10:30",
  notificationMethod: "IN_APP",
  lang: "hi",
  consent: true,
});

function fixture(configured = false) {
  const entries: Row[] = [],
    matches: Row[] = [],
    notices: Row[] = [],
    users = [user("a"), user("b"), user("c")];
  let approved = true;
  let sent = 0;
  let failMail = false;
  const joins = (row: Row) => ({
    ...row,
    request: { ...entries.find((entry) => entry.id === row.requestId), user: users.find((u) => u.id === entries.find((e) => e.id === row.requestId)?.userId) },
    offer: { ...entries.find((entry) => entry.id === row.offerId), user: users.find((u) => u.id === entries.find((e) => e.id === row.offerId)?.userId) },
  });
  const checkEntry = (entry: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === "userId" && typeof value === "object") return entry.userId !== value.not;
      if (key === "travelDate") return value instanceof Date ? entry.travelDate.getTime() === value.getTime() : entry.travelDate >= value.gte;
      if (key === "user") return true;
      if (key === "requests") return !matches.some((m) => m.requestId === entry.id && m.status === "CONFIRMED");
      if (key === "status" && typeof value === "object") return value.in.includes(entry.status);
      return entry[key] === value;
    });
  const checkMatch = (match: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((condition: Row) => checkMatch(match, condition));
      if (key === "request" || key === "offer") return entries.find((entry) => entry.id === match[`${key}Id`])?.userId === value.userId;
      if (key === "status" && typeof value === "object") return value.in.includes(match.status);
      if (key === "id" && typeof value === "object") return match.id !== value.not;
      return match[key] === value;
    });
  const db: Row = {
    family: { findFirst: async () => (approved ? { contactNumber: "9000000000" } : null) },
    familyMember: { findFirst: async () => null },
    safarEntry: {
      count: async ({ where }: Row) => entries.filter((row) => checkEntry(row, where)).length,
      create: async ({ data }: Row) => {
        const row = { ...data, status: "OPEN", createdAt: new Date() };
        entries.push(row);
        return row;
      },
      findUnique: async ({ where }: Row) =>
        entries.find((row) =>
          where.id
            ? row.id === where.id
            : row.userId === where.userId_clientRequestId.userId && row.clientRequestId === where.userId_clientRequestId.clientRequestId,
        ),
      findMany: async ({ where }: Row) => entries.filter((row) => checkEntry(row, where)),
      update: async ({ where, data }: Row) => Object.assign(rowById(entries, where.id), data),
    },
    safarMatch: {
      count: async ({ where }: Row) => matches.filter((row) => checkMatch(row, where)).length,
      create: async ({ data }: Row) => {
        const row = { ...data, status: "PROPOSED", requestAccepted: false, offerAccepted: false, createdAt: new Date() };
        matches.push(row);
        return row;
      },
      findMany: async ({ where }: Row) => matches.filter((row) => checkMatch(row, where)).map(joins),
      findUnique: async ({ where }: Row) => {
        const row = matches.find((row) => row.id === where.id);
        return row ? joins(row) : null;
      },
      findUniqueOrThrow: async ({ where }: Row) => {
        const row = matches.find((row) => row.id === where.id);
        if (!row) throw new Error("missing");
        return row;
      },
      update: async ({ where, data }: Row) => Object.assign(rowById(matches, where.id), data),
    },
    safarNotice: {
      createMany: async ({ data }: Row) => {
        for (const row of data)
          if (!notices.some((n) => n.userId === row.userId && n.matchId === row.matchId && n.kind === row.kind))
            notices.push({ ...row, createdAt: new Date() });
      },
      findMany: async ({ where, include }: Row) =>
        notices
          .filter((row) => Object.entries(where).every(([key, value]) => row[key] === value))
          .map((row) => (include ? { ...row, user: users.find((u) => u.id === row.userId), match: joins(rowById(matches, row.matchId)) } : row)),
      updateMany: async ({ where, data }: Row) => {
        const row = notices.find((row) => row.id === where.id && row.emailStatus === where.emailStatus);
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      },
      update: async ({ where, data }: Row) => Object.assign(rowById(notices, where.id), data),
    },
  };
  db.$transaction = async (work: (tx: Row) => Promise<unknown>) => work(db);
  const service = new SafarService(
    db as PrismaService,
    {
      isConfigured: () => configured,
      send: async () => {
        if (failMail) throw new Error("SMTP failure");
        sent++;
        return {};
      },
    } as unknown as MailService,
    { frontendUrl: "http://localhost:5173" } as AppConfigService,
  );
  return {
    service,
    entries,
    matches,
    notices,
    users,
    setApproved: (value: boolean) => {
      approved = value;
    },
    failEmail: () => {
      failMail = true;
    },
    sent: () => sent,
  };
}

test("route aliases, direction, date and assistance compatibility are explicit", () => {
  assert.equal(routeKey("  इंदौर "), routeKey("INDORE"));
  assert.notEqual(routeKey("Indore"), routeKey("Khargone"));
  assert.equal(validTravelDate("2099-02-30"), false);
  assert.equal(validTravelDate("2000-01-01"), false);
  assert.equal(compatibleType("URGENT", "TRAVEL"), true);
  assert.equal(compatibleType("DELIVERY", "TRAVEL"), false);
});
test("DTO rejects missing consent, malformed time, overlong input, unsupported SMS", () => {
  const value = plainToInstance(CreateSafarDto, { ...request(), consent: false, preferredTime: "25:99", notificationMethod: "SMS", origin: "a".repeat(151) });
  assert.equal(validateSync(value).length, 4);
  assert.equal(validateSync(plainToInstance(CreateSafarDto, request())).length, 0);
});
test("only approved members using their registered mobile and email can submit", async () => {
  const f = fixture();
  f.setApproved(false);
  await assert.rejects(
    () => f.service.create(request(), f.users[0]),
    (error: unknown) => error instanceof ApiError && JSON.stringify(error.getResponse()).includes("SAFAR_MEMBERSHIP_REQUIRED"),
  );
  f.setApproved(true);
  await assert.rejects(
    () => f.service.create({ ...request(), phone: "9111111111" }, f.users[0]),
    (error: unknown) => error instanceof ApiError && JSON.stringify(error.getResponse()).includes("SAFAR_REGISTERED_MOBILE"),
  );
  await assert.rejects(
    () => f.service.create({ ...request(), email: "other@example.invalid" }, f.users[0]),
    (error: unknown) => error instanceof ApiError && JSON.stringify(error.getResponse()).includes("SAFAR_REGISTERED_EMAIL"),
  );
  await assert.rejects(
    () => f.service.create({ ...request(), notificationMethod: "EMAIL" }, f.users[0]),
    (error: unknown) => error instanceof ApiError && JSON.stringify(error.getResponse()).includes("SAFAR_EMAIL_UNAVAILABLE"),
  );
  assert.equal(f.entries.length, 0);
});
for (const offerFirst of [true, false])
  test(`matches are persisted in either submission order (offer first ${offerFirst})`, async () => {
    const f = fixture();
    const a = offerFirst ? request("OFFER") : request();
    const b = offerFirst ? request() : request("OFFER");
    await f.service.create(a, f.users[0]);
    const result = await f.service.create({ ...b, origin: "Indore" }, f.users[1]);
    assert.equal(result.matches, 1);
    assert.equal(f.notices.length, 2);
    assert.equal((await f.service.mine(f.users[0])).matches[0].contact, null);
    const repeated = await f.service.create({ ...b, origin: "Indore" }, f.users[1]);
    assert.equal(result.id, repeated.id);
    assert.equal(f.entries.length, 2);
    assert.equal(f.notices.length, 2);
  });
test("mismatched route/date/type and self-offers do not match", async () => {
  const f = fixture();
  await f.service.create(request(), f.users[0]);
  await f.service.create(request("OFFER"), f.users[0]);
  await f.service.create({ ...request("OFFER"), destination: "Bhopal" }, f.users[1]);
  await f.service.create({ ...request("OFFER"), travelDate: "2099-11-30" }, f.users[1]);
  await f.service.create({ ...request("OFFER"), requestType: "DELIVERY" }, f.users[1]);
  assert.equal(f.matches.length, 0);
  await assert.rejects(
    () => f.service.create({ ...request(), requestType: "DELIVERY" }, f.users[1]),
    (error: unknown) => error instanceof ApiError && JSON.stringify(error.getResponse()).includes("SAFAR_ITEM_REQUIRED"),
  );
});
test("contacts require mutual acceptance; outsiders cannot act; completion prevents reuse", async () => {
  const f = fixture();
  await f.service.create(request(), f.users[0]);
  await f.service.create(request("OFFER"), f.users[1]);
  const id = f.matches[0].id;
  await assert.rejects(
    () => f.service.decide(id, "ACCEPT", f.users[2]),
    (error: unknown) => error instanceof ApiError && JSON.stringify(error.getResponse()).includes("SAFAR_NOT_FOUND"),
  );
  await f.service.decide(id, "ACCEPT", f.users[0]);
  assert.equal((await f.service.mine(f.users[0])).matches[0].contact, null);
  await f.service.decide(id, "ACCEPT", f.users[1]);
  assert.equal(f.matches[0].status, "CONFIRMED");
  assert.equal((await f.service.mine(f.users[0])).matches[0].contact?.phone, "9000000000");
  assert.equal((await f.service.mine(f.users[2])).matches.length, 0);
  f.entries[0].travelDate = new Date("2000-01-01T00:00:00Z");
  await f.service.decide(id, "COMPLETE", f.users[0]);
  assert.equal(f.entries[0].status, "COMPLETED");
  await assert.rejects(
    () => f.service.decide(id, "ACCEPT", f.users[1]),
    (error: unknown) => error instanceof ApiError && JSON.stringify(error.getResponse()).includes("SAFAR_INVALID_STATE"),
  );
});
test("confirmation cancels competing matches; no new offer matches an already confirmed request", async () => {
  const f = fixture();
  await f.service.create(request(), f.users[0]);
  await f.service.create(request("OFFER"), f.users[1]);
  await f.service.create(request("OFFER"), f.users[2]);
  await f.service.decide(f.matches[0].id, "ACCEPT", f.users[0]);
  await f.service.decide(f.matches[0].id, "ACCEPT", f.users[1]);
  assert.equal(f.matches[1].status, "CANCELLED");
  assert.equal((await f.service.create(request("OFFER"), f.users[2])).matches, 0);
});
test("cancellation is owner-only, cancels matches and withdraws contact access", async () => {
  const f = fixture();
  const entry = await f.service.create(request(), f.users[0]);
  await f.service.create(request("OFFER"), f.users[1]);
  await f.service.decide(f.matches[0].id, "ACCEPT", f.users[0]);
  await f.service.decide(f.matches[0].id, "ACCEPT", f.users[1]);
  await assert.rejects(
    () => f.service.cancel(entry.id, f.users[2]),
    (error: unknown) => error instanceof ApiError && JSON.stringify(error.getResponse()).includes("SAFAR_NOT_FOUND"),
  );
  await f.service.cancel(entry.id, f.users[0]);
  assert.equal(f.matches[0].status, "CANCELLED");
  assert.equal((await f.service.mine(f.users[1])).matches[0].contact, null);
});
test("email is optional, deduplicated and failures do not lose a saved request or private notice", async () => {
  const f = fixture(true);
  await f.service.create({ ...request(), notificationMethod: "EMAIL" }, f.users[0]);
  f.failEmail();
  const result = await f.service.create(request("OFFER"), f.users[1]);
  assert.equal(result.matches, 1);
  assert.equal(f.entries.length, 2);
  assert.equal(f.notices.find((n) => n.userId === "a")?.emailStatus, "FAILED");
  const g = fixture(true);
  await g.service.create({ ...request(), notificationMethod: "EMAIL" }, g.users[0]);
  const offer = request("OFFER");
  await g.service.create(offer, g.users[1]);
  await g.service.create(offer, g.users[1]);
  assert.equal(g.sent(), 1);
});
