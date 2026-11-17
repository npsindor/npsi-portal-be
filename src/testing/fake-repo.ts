import { mock } from "node:test";
import { Prisma } from "../generated/prisma/client.js";

const DECIMAL_FIELDS = new Set(["amount", "fee", "feePerMember", "totalFee"]);

// What Prisma would store: undefined fields skipped, DbNull as null, decimals as Decimal.
const asStored = <T extends object>(data: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value === Prisma.DbNull ? null : DECIMAL_FIELDS.has(key) && typeof value === "number" ? new Prisma.Decimal(value) : value]),
  ) as Partial<T>;

// In-memory stand-in for a generated per-model repository: create/update keep
// what was written, list returns what's stored. `build` turns written data into
// a full row (a builder from rows.ts).
export const fakeModelRepo = <Row extends { id: string }>(build: (data: Partial<Row>) => Row, initial: Row[] = []) => {
  const stored: Row[] = [...initial];
  return {
    stored,
    list: mock.fn(async (..._args: unknown[]) => stored),
    findById: mock.fn(async (id: string) => stored.find((row) => row.id === id) ?? null),
    create: mock.fn(async (data: Partial<Row>) => {
      const row = build(asStored(data));
      stored.push(row);
      return row;
    }),
    createMany: mock.fn(async (rows: Partial<Row>[]) => rows.map((data) => build(asStored(data)))),
    update: mock.fn(async (id: string, data: Partial<Row>) => {
      const row = stored.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, asStored(data));
      return row;
    }),
    delete: mock.fn(async (_id: string) => undefined),
    latestDisplayIds: mock.fn(async (_prefix: string): Promise<(string | null)[]> => []),
    hasRegistrations: mock.fn(async (_eventId: string) => false),
    activeExists: mock.fn(async (_familyId: string, _eventId: string) => false),
    recountFamilies: mock.fn(async (_familyIds: (string | null | undefined)[], _db?: unknown) => undefined),
  };
};

export const FAM = "NPSI-FAM-000001";

// MembershipRepository stand-in. The member "u-m" belongs to FAM, whose only
// member row is "m-own" (membership NPSI-MEM-000001).
export const fakeMembership = () => ({
  ownFamilyId: mock.fn(async (user: { id: string } | null) => (user?.id === "u-m" ? FAM : null)),
  familyIdOfMembership: mock.fn(async (id: string) => (id === "NPSI-MEM-000001" ? FAM : id === "NPSI-MEM-000002" ? "OTHER" : null)),
  memberIdsOfFamily: mock.fn(async (_familyId: string) => ["m-own"]),
  studentOwner: mock.fn(async (id: string) =>
    id === "STU-OWN"
      ? { email: "Member@Example.com", linkedFamilyId: null }
      : id === "STU-FAM"
        ? { email: null, linkedFamilyId: FAM }
        : id === "STU-OTHER"
          ? { email: "x@y.z", linkedFamilyId: "OTHER" }
          : null,
  ),
});

// EventsRepository stand-in: "ev" costs 250 per member, "free" nothing.
export const fakeEvents = () => ({
  feeOf: mock.fn(async (id: string) =>
    id === "ev"
      ? { title: "Garba", fee: 250, status: "PUBLISHED" }
      : id === "free"
        ? { title: "Puja", fee: 0, status: "PUBLISHED" }
        : id === "draft"
          ? { title: "Diwali", fee: 0, status: "DRAFT" }
          : null,
  ),
});

// PrismaService stand-in for services that open a transaction: runs the work
// with a marker client (the fake repositories ignore which client they get).
// It also answers the login-account lookups (login-account.ts) with "no such records" unless `accounts` lists some.
export interface FakeAccountRecords {
  users?: Record<string, unknown>[];
  families?: Record<string, unknown>[];
  members?: Record<string, unknown>[];
  applications?: Record<string, unknown>[];
  students?: Record<string, unknown>[];
  studentApplications?: Record<string, unknown>[];
}
type Where = { OR?: Where[]; NOT?: Where; [key: string]: unknown };
const matches = (row: Record<string, unknown>, where: Where | undefined): boolean => {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Where[]).some((part) => matches(row, part));
    if (key === "NOT") return !matches(row, value as Where);
    if (value && typeof value === "object" && !(value instanceof Date))
      return row[key] && typeof row[key] === "object" ? matches(row[key] as Record<string, unknown>, value as Where) : false;
    return String(row[key] ?? "").toLowerCase() === String(value ?? "").toLowerCase();
  });
};
export const fakeAccountDb = (records: FakeAccountRecords = {}) => {
  const model = (rows: Record<string, unknown>[] = []) => ({
    findMany: mock.fn(async (args: { where?: Where } = {}) => rows.filter((row) => matches(row, args.where))),
    findFirst: mock.fn(async (args: { where?: Where } = {}) => rows.find((row) => matches(row, args.where)) ?? null),
    findUnique: mock.fn(async (args: { where?: Where } = {}) => rows.find((row) => matches(row, args.where)) ?? null),
  });
  return {
    user: model(records.users),
    family: model(records.families),
    familyMember: model(records.members),
    application: model(records.applications),
    student: model(records.students),
    studentApplication: model(records.studentApplications),
  };
};
export const TX = { transaction: true, ...fakeAccountDb() };
export const fakePrisma = (accounts?: FakeAccountRecords) => {
  const db = accounts ? fakeAccountDb(accounts) : fakeAccountDb();
  const tx = accounts ? { transaction: true, ...db } : TX;
  return { ...db, $transaction: mock.fn(async <T>(work: (tx: typeof TX) => Promise<T>) => work(tx as typeof TX)) };
};

// AuthService stand-in: records invitations.
// Registration-fee lookups for review services: `fee` is what feeFor returns (null = no fee recorded).
export const fakeFees = (fee: { id: string; paymentStatus: string | null } | null = null) => ({
  feeFor: mock.fn(async (..._args: unknown[]) => fee),
  update: mock.fn(async (..._args: unknown[]) => fee),
});
export const fakeNotifier = () => ({ deliver: mock.fn(async (_messages: unknown[]) => undefined) });

export const fakeAuth = () => ({ invite: mock.fn(async (_body: unknown) => ({ ok: true as const, username: "u", password: "p" })) });
