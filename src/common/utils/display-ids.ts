// Sequential display ids such as NPSI-FAM-000123: prefix + 6-digit number.
const WIDTH = 6;
const MAX_ATTEMPTS = 3;

// Display-ID prefixes are ASCII tokens ending in '-'. The next ASCII character
// is '.', so this range selects the same prefix without Prisma's LIKE expression
// (which fails with a collation error on the hosted MariaDB server).
export const displayIdPrefixRange = (prefix: string): { gte: string; lt: string } => {
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*-$/.test(prefix)) throw new Error("Invalid display-ID prefix");
  return { gte: prefix, lt: `${prefix.slice(0, -1)}.` };
};

// The next id after the highest numbered one among `existing` (ids sharing the
// prefix, e.g. the latest few in descending order).
export const nextDisplayId = (prefix: string, existing: (string | null)[]): string => {
  const numbers = existing.map((id) => (id?.startsWith(prefix) ? id.slice(prefix.length) : "")).filter((suffix) => /^\d+$/.test(suffix));
  const highest = Math.max(0, ...numbers.map(Number));
  return `${prefix}${String(highest + 1).padStart(WIDTH, "0")}`;
};

export const displayIdAt = (prefix: string, number: number): string => `${prefix}${String(number).padStart(WIDTH, "0")}`;

// Creates a record under the next free display id. Two simultaneous creates
// can pick the same id; the unique index rejects the second (P2002), which
// then retries with the next one.
export const createWithDisplayId = async <T>(
  prefix: string,
  latest: (prefix: string) => Promise<(string | null)[]>,
  create: (displayId: string) => Promise<T>,
): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await create(nextDisplayId(prefix, await latest(prefix)));
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isUniqueViolation(error)) throw error;
    }
  }
};

// Prisma's unique-constraint error (P2002), whatever error class the driver adapter wraps it in.
export const isUniqueViolation = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === "P2002";
