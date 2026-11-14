import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommunityPost, Prisma } from "../generated/prisma/client.js";
import { admin, as, rejectsWith } from "../testing/fakes.js";
import type { CommunityPostsRepository } from "./community-posts.repository.js";
import { validPhone } from "./community-posts.rules.js";
import { CommunityPostsService } from "./community-posts.service.js";
import type { CreateCommunityPostDto } from "./dto/community-posts.dto.js";

const fakeRepository = () => {
  const rows = new Map<string, CommunityPost>();
  const nulls = {
    titleHi: null,
    body: null,
    bodyHi: null,
    imageUrl: null,
    eventDate: null,
    location: null,
    locationHi: null,
    contactName: null,
    contactPhone: null,
    linkUrl: null,
    ctaLabel: null,
    ctaLabelHi: null,
    featured: false,
    sortOrder: 0,
    active: true,
  };
  const defined = (data: object) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  return as<CommunityPostsRepository>({
    list: async (where: Prisma.CommunityPostWhereInput) =>
      [...rows.values()]
        .filter((row) => (!where.section || row.section === where.section) && (where.active === undefined || row.active === where.active))
        .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder),
    findById: async (id: string) => rows.get(id) ?? null,
    create: async (data: Prisma.CommunityPostUncheckedCreateInput) => {
      const row = { ...nulls, ...defined(data), createdAt: new Date(), updatedAt: new Date() } as CommunityPost;
      rows.set(row.id, row);
      return row;
    },
    update: async (id: string, data: Prisma.CommunityPostUncheckedUpdateInput) => {
      const row = rows.get(id);
      if (!row) return null;
      const next = { ...row, ...defined(data) } as CommunityPost;
      rows.set(id, next);
      return next;
    },
    delete: async (id: string) => {
      rows.delete(id);
    },
  });
};
const post = (overrides: Partial<CreateCommunityPostDto> = {}) =>
  ({ section: "BLOOD_DONATION", title: "Blood donation camp", ...overrides }) as CreateCommunityPostDto;

test("phone and helpline numbers", () => {
  for (const ok of ["100", "108", "+91 98765 43210", "0731-2345678"]) assert.equal(validPhone(ok), true, ok);
  for (const bad of ["12", "call me", "+", "98765abc"]) assert.equal(validPhone(bad), false, bad);
});

test("posts are validated, trimmed and dated; the public sees active posts with featured first", async () => {
  const service = new CommunityPostsService(fakeRepository());
  const camp = await service.create(post({ eventDate: "2026-12-05", body: "  Donate blood  ", contactPhone: "+91 98765 43210", sortOrder: 2 }));
  assert.equal(camp.eventDate, "2026-12-05");
  assert.equal(camp.body, "Donate blood");
  await service.create(post({ title: "Donor registration", featured: true, sortOrder: 5 }));
  await service.create(post({ title: "Old camp", active: false }));
  await service.create(post({ section: "EMERGENCY_HELP", title: "Ambulance", contactPhone: "108" }));
  assert.deepEqual(
    (await service.list({ section: "BLOOD_DONATION" }, null)).map((row) => row.title),
    ["Donor registration", "Blood donation camp"],
  );
  assert.equal((await service.list({ section: "BLOOD_DONATION" }, admin())).length, 3);
  assert.equal((await service.list({}, null)).length, 3);
  await rejectsWith(service.create(post({ contactPhone: "call me" })), 400, "Enter a valid phone or helpline number.");
  await rejectsWith(service.create(post({ imageUrl: "javascript:alert(1)" })), 400, /image URL/);
  await rejectsWith(service.create(post({ ctaLabel: "Register" })), 400, "Add a link for the button text.");
  await rejectsWith(service.create(post({ title: "<script>" })), 400, /cannot contain/);
});

test("updates keep unsent fields, can move a post to another section and 404 for unknown ids", async () => {
  const service = new CommunityPostsService(fakeRepository());
  const created = await service.create(post({ linkUrl: "/register", ctaLabel: "Register", contactPhone: "108" }));
  const moved = await service.update(created.id, { section: "SOCIAL_WELFARE", sortOrder: 4 });
  assert.equal(moved.section, "SOCIAL_WELFARE");
  assert.equal(moved.ctaLabel, "Register");
  assert.equal(moved.contactPhone, "108");
  await rejectsWith(service.update(created.id, { linkUrl: null }), 400, "Add a link for the button text.");
  const cleared = await service.update(created.id, { linkUrl: null, ctaLabel: "", eventDate: null });
  assert.equal(cleared.linkUrl, null);
  assert.equal(cleared.ctaLabel, null);
  await rejectsWith(service.update("missing", { title: "x" }), 404, "Record not found");
  await service.remove(created.id);
  assert.equal((await service.list({}, admin())).length, 0);
});
