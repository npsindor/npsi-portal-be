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
import { canMatch, compatibleType, MATCH_WINDOW_MINUTES, minutesApart, routeKey, validTravelDate } from "./safar.rules.js";
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
      if (key === "travelDate")
        return value instanceof Date
          ? entry.travelDate.getTime() === value.getTime()
          : (!value.gte || entry.travelDate >= value.gte) && (!value.lte || entry.travelDate <= value.lte);
      if (key === "id" && typeof value === "object") return value.in.includes(entry.id);
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
    student: { findFirst: async () => null },
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

// ---- Matching rules: a travel plan pairs with a parcel or travel-together request on the same route and time ----
const at = (date: string, time: string) => ({ travelDate: new Date(`${date}T00:00:00Z`), preferredTime: time });
const parcel = (fields: Partial<CreateSafarDto> = {}): CreateSafarDto => ({
  ...request(),
  requestType: "DELIVERY",
  itemDetails: "Parcel pahuchan he",
  origin: "Indore",
  destination: "Khargone",
  travelDate: "2099-11-29",
  preferredTime: "19:00",
  ...fields,
});
const plan = (fields: Partial<CreateSafarDto> = {}): CreateSafarDto => ({
  ...request("OFFER"),
  origin: "Indore",
  destination: "Khargone",
  travelDate: "2099-11-29",
  preferredTime: "19:00",
  ...fields,
});
const companion = (fields: Partial<CreateSafarDto> = {}): CreateSafarDto => ({ ...plan(), kind: "REQUEST", requestType: "TRAVEL", ...fields });

test("place names: case, spaces, state suffixes, brackets and common spellings give one key", () => {
  for (const spelling of ["Khargone", "  KHARGONE ", "Khargon", "khargaon", "Khargone (MP)", "Khargone, M.P.", "खरगोन"])
    assert.equal(routeKey(spelling), "khargone", spelling);
  for (const spelling of ["Indore", "indore.", "Indore, Madhya Pradesh", "इंदौर"]) assert.equal(routeKey(spelling), "indore", spelling);
  // ड़ typed as one letter or as ड + nukta
  assert.equal(routeKey("ब\u095Cवानी"), "barwani");
  assert.equal(routeKey("ब\u0921\u093Cवानी"), "barwani");
  assert.notEqual(routeKey("Khargone"), routeKey("Khandwa"));
});

test("time window: same time and a few hours apart match, more than the window does not, across midnight counts", () => {
  assert.equal(minutesApart(at("2099-11-29", "19:00"), at("2099-11-29", "19:00")), 0);
  assert.equal(minutesApart(at("2099-11-29", "23:30"), at("2099-11-30", "00:30")), 60);
  const base = { kind: "REQUEST", requestType: "DELIVERY", originKey: "indore", destinationKey: "khargone", ...at("2099-11-29", "19:00") };
  const offer = (date: string, time: string, requestType = "BOTH") => ({ ...base, kind: "OFFER", requestType, ...at(date, time) });
  assert.equal(canMatch(base, offer("2099-11-29", "19:00")), true);
  assert.equal(canMatch(base, offer("2099-11-29", "16:00")), true);
  assert.equal(MATCH_WINDOW_MINUTES, 240);
  assert.equal(canMatch(base, offer("2099-11-29", "23:00")), true); // exactly the window
  assert.equal(canMatch(base, offer("2099-11-29", "23:01")), false);
  assert.equal(canMatch(base, offer("2099-11-30", "19:00")), false);
  assert.equal(canMatch(base, offer("2099-11-29", "19:00", "TRAVEL")), false); // travels, but carries no parcels
  assert.equal(canMatch(base, offer("2099-11-29", "19:00", "DELIVERY")), true);
  assert.equal(canMatch(base, { ...offer("2099-11-29", "19:00"), destinationKey: "khandwa" }), false);
  assert.equal(canMatch(base, { ...offer("2099-11-29", "19:00"), originKey: "khargone", destinationKey: "indore" }), false); // the way back
  assert.equal(canMatch(base, { ...base }), false); // two requests never pair
});

test("Indore → Khargone 29 Nov 19:00: a travel plan and a parcel request of two members match, shown to both", async () => {
  const f = fixture();
  await f.service.create(plan(), f.users[0]);
  const result = await f.service.create(parcel(), f.users[1]);
  assert.equal(result.matches, 1);
  const traveller = await f.service.mine(f.users[0]);
  assert.equal(traveller.matches.length, 1);
  assert.equal(traveller.matches[0].requestType, "DELIVERY");
  assert.equal(traveller.matches[0].otherKind, "REQUEST");
  assert.equal(traveller.matches[0].ownKind, "OFFER");
  assert.equal(traveller.matches[0].minutesApart, 0);
  assert.equal(traveller.matches[0].origin, "Indore");
  assert.equal(traveller.matches[0].destination, "Khargone");
  assert.equal(traveller.matches[0].preferredTime, "19:00");
  const sender = await f.service.mine(f.users[1]);
  assert.equal(sender.matches[0].otherKind, "OFFER");
  assert.equal(sender.matches[0].status, "PROPOSED");
});

test("travel plan + travel-together request match within the window; a different destination does not", async () => {
  const f = fixture();
  await f.service.create(plan({ preferredTime: "18:00" }), f.users[0]);
  assert.equal((await f.service.create(companion({ preferredTime: "20:30" }), f.users[1])).matches, 1);
  assert.equal((await f.service.create(companion({ destination: "Khandwa" }), f.users[2])).matches, 0);
  assert.equal((await f.service.create(companion({ preferredTime: "23:30" }), f.users[2])).matches, 0);
  assert.equal(f.matches.length, 1);
});

test("a cancelled travel plan or parcel request never matches", async () => {
  const f = fixture();
  const offer = await f.service.create(plan(), f.users[0]);
  await f.service.cancel(offer.id, f.users[0]);
  assert.equal((await f.service.create(parcel(), f.users[1])).matches, 0);
  const g = fixture();
  const sent = await g.service.create(parcel(), g.users[1]);
  await g.service.cancel(sent.id, g.users[1]);
  assert.equal((await g.service.create(plan(), g.users[0])).matches, 0);
  assert.equal((await g.service.mine(g.users[0])).matches.length, 0);
});

test("entries saved without a match (older rules) are matched when a member opens the page, once", async () => {
  const f = fixture();
  await f.service.create(plan(), f.users[0]);
  await f.service.create(parcel(), f.users[1]);
  // As if both were saved before matching existed: no pair stored.
  f.matches.length = 0;
  f.notices.length = 0;
  const first = await f.service.mine(f.users[1]);
  assert.equal(first.matches.length, 1);
  assert.equal(f.notices.filter((n) => n.kind === "PROPOSED").length, 2);
  // Refreshing again and again (both members) never adds a second pair or notice.
  await f.service.mine(f.users[1]);
  await f.service.mine(f.users[0]);
  assert.equal(f.matches.length, 1);
  assert.equal(f.notices.length, 2);
  assert.equal((await f.service.mine(f.users[0])).matches.length, 1);
});

test("a declined pair is not proposed again on refresh; past travel dates are not matched", async () => {
  const f = fixture();
  await f.service.create(plan(), f.users[0]);
  await f.service.create(parcel(), f.users[1]);
  await f.service.decide(f.matches[0].id, "DECLINE", f.users[0]);
  await f.service.mine(f.users[0]);
  assert.equal(f.matches.length, 1);
  assert.equal(f.matches[0].status, "DECLINED");
  const g = fixture();
  await g.service.create(plan(), g.users[0]);
  await g.service.create(parcel(), g.users[1]);
  g.matches.length = 0;
  for (const entry of g.entries) entry.travelDate = new Date("2000-01-01T00:00:00Z");
  await g.service.mine(g.users[0]);
  assert.equal(g.matches.length, 0);
});

test("your own travel plan and parcel request do not pair with each other, but the page says why", async () => {
  const f = fixture();
  await f.service.create(plan(), f.users[0]);
  assert.equal((await f.service.create(parcel(), f.users[0])).matches, 0);
  const mine = await f.service.mine(f.users[0]);
  assert.equal(mine.matches.length, 0);
  assert.equal(mine.ownPairs, 1);
  assert.equal((await f.service.mine(f.users[1])).ownPairs, 0);
});

test("submitting the same form twice saves one entry and one match", async () => {
  const f = fixture();
  await f.service.create(plan(), f.users[0]);
  const form = parcel();
  const once = await f.service.create(form, f.users[1]);
  const twice = await f.service.create(form, f.users[1]);
  assert.equal(once.id, twice.id);
  assert.equal(twice.matches, 1);
  assert.equal(f.entries.length, 2);
  assert.equal(f.matches.length, 1);
});
