import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationPipe } from "@nestjs/common";
import type { PrismaService } from "../database/prisma.service.js";
import { CreateContactInfoDto } from "./contact-info.dto.js";
import { ContactInfoService } from "./contact-info.service.js";

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const validate = (value: unknown): Promise<CreateContactInfoDto> => pipe.transform(value, { type: "body", metatype: CreateContactInfoDto });
const valid = { fullName: "  नमिता पाटीदार  ", contactNumber: "+91 98765 43210", indoreArea: "राऊ", nativeVillage: "बोरावाँ" };

test("normalizes contact details and persists optional email/student defaults", async () => {
  const dto = await validate({ ...valid, email: "  ", ignored: "not persisted" });
  let stored: unknown;
  const prisma = {
    contactInfo: {
      create: async (args: unknown) => {
        stored = args;
        return { id: "saved" };
      },
    },
  };
  const service = new ContactInfoService(prisma as unknown as PrismaService);
  assert.deepEqual(await service.create(dto), { success: true, message: "Thank you! Your details have been saved." });
  const { data } = stored as { data: Record<string, unknown> };
  assert.equal(data.fullName, "नमिता पाटीदार");
  assert.equal(data.contactNumber, "9876543210");
  assert.equal(data.email, null);
  assert.equal(data.isStudent, false);
  assert.equal(data.ignored, undefined);
  assert.equal(typeof data.id, "string");
});

test("accepts custom locations and returns Hindi thanks only after saving", async () => {
  const dto = await validate({ ...valid, indoreArea: "Custom area", nativeVillage: "Custom village", email: " A@EXAMPLE.COM ", isStudent: true, lang: "hi" });
  assert.equal(dto.email, "a@example.com");
  const service = new ContactInfoService({ contactInfo: { create: async () => ({ id: "saved" }) } } as unknown as PrismaService);
  assert.match((await service.create(dto)).message, /धन्यवाद/);
  const failure = new ContactInfoService({
    contactInfo: {
      create: async () => {
        throw new Error("DB unavailable");
      },
    },
  } as unknown as PrismaService);
  await assert.rejects(failure.create(dto), /DB unavailable/);
});

test("rejects invalid, missing and oversized fields and non-boolean student values", async () => {
  for (const patch of [
    { fullName: " " },
    { fullName: 123 },
    { fullName: "a".repeat(151) },
    { contactNumber: "1234" },
    { contactNumber: null },
    { email: "invalid" },
    { indoreArea: " " },
    { nativeVillage: "" },
    { nativeVillage: "v".repeat(151) },
    { isStudent: "false" },
    { isStudent: null },
    { lang: "fr" },
  ])
    await assert.rejects(validate({ ...valid, ...patch }));
  await assert.rejects(validate({}));
});

test("lists one page newest first with the total and ISO dates", async () => {
  const createdAt = new Date("2026-10-11T10:00:00Z");
  const row = { id: "c1", fullName: "A", contactNumber: "9876543210", email: null, indoreArea: "Rau", nativeVillage: "Borawan", isStudent: false, createdAt };
  let findArgs: unknown;
  const prisma = {
    contactInfo: {
      findMany: async (args: unknown) => {
        findArgs = args;
        return [row];
      },
      count: async () => 7,
    },
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  };
  const service = new ContactInfoService(prisma as unknown as PrismaService);
  assert.deepEqual(await service.list({ limit: 1, offset: 3 }), { items: [{ ...row, createdAt: "2026-10-11T10:00:00.000Z" }], total: 7, limit: 1, offset: 3 });
  assert.deepEqual((findArgs as { orderBy: unknown }).orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(await service.list({}).then(({ limit, offset }) => [limit, offset]), [100, 0]);
});

test("public HTTP endpoint validates input, inserts once and rate limits submissions", async () => {
  const { Test } = await import("@nestjs/testing");
  const { default: request } = await import("supertest");
  const { DatabaseModule } = await import("../database/database.module.js");
  const { PrismaService: PrismaToken } = await import("../database/prisma.service.js");
  const { ContactInfoModule } = await import("./contact-info.module.js");
  const { AdminGuard } = await import("../common/guards/auth.guards.js");
  let inserts = 0;
  const module = await Test.createTestingModule({ imports: [DatabaseModule, ContactInfoModule] })
    .overrideProvider(PrismaToken)
    .useValue({
      contactInfo: {
        create: async () => {
          inserts++;
          return { id: "saved" };
        },
      },
    })
    .overrideGuard(AdminGuard)
    .useValue({ canActivate: () => false })
    .compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  try {
    const response = await request(app.getHttpServer()).post("/api/v1/contact-info").send(valid).expect(201);
    assert.equal(response.body.success, true);
    assert.equal(inserts, 1);
    for (let i = 0; i < 9; i++) await request(app.getHttpServer()).post("/api/v1/contact-info").send({}).expect(400);
    await request(app.getHttpServer()).post("/api/v1/contact-info").send(valid).expect(429);
    assert.equal(inserts, 1);
    await request(app.getHttpServer()).get("/api/v1/contact-info").expect(403);
  } finally {
    await app.close();
  }
});
