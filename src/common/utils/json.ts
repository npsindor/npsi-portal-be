import { Prisma } from "../../generated/prisma/client.js";

// A JSON request value as Prisma input: null clears the column (SQL NULL), undefined leaves it.
export const toJsonInput = (value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};
