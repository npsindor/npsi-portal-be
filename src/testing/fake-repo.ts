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
export const TX = { transaction: true };
export const fakePrisma = () => ({ $transaction: mock.fn(async <T>(work: (tx: typeof TX) => Promise<T>) => work(TX)) });

// AuthService stand-in: records invitations.
export const fakeAuth = () => ({ invite: mock.fn(async (_body: unknown) => ({ ok: true as const, username: "u", password: "p" })) });
