import assert from "node:assert/strict";
import { test } from "node:test";
import type { PageBlock, Prisma } from "../generated/prisma/client.js";
import { admin, as, rejectsWith } from "../testing/fakes.js";
import type { CreatePageBlockDto } from "./dto/page-blocks.dto.js";
import type { PageBlocksRepository } from "./page-blocks.repository.js";
import { PageBlocksService } from "./page-blocks.service.js";

const fakeRepository = () => {
  const rows = new Map<string, PageBlock>();
  const nulls = {
    role: "ITEM",
    title: null,
    titleHi: null,
    subtitle: null,
    subtitleHi: null,
    body: null,
    bodyHi: null,
    mediaType: "NONE",
    mediaUrl: null,
    linkUrl: null,
    ctaLabel: null,
    ctaLabelHi: null,
    sortOrder: 0,
    active: true,
  };
  const defined = (data: object) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  return as<PageBlocksRepository>({
    list: async (where: Prisma.PageBlockWhereInput) =>
      [...rows.values()]
        .filter((row) => (!where.page || row.page === where.page) && (where.active === undefined || row.active === where.active))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    findById: async (id: string) => rows.get(id) ?? null,
    create: async (data: Prisma.PageBlockUncheckedCreateInput) => {
      const row = { ...nulls, ...defined(data), createdAt: new Date(), updatedAt: new Date() } as PageBlock;
      rows.set(row.id, row);
      return row;
    },
    update: async (id: string, data: Prisma.PageBlockUncheckedUpdateInput) => {
      const row = rows.get(id);
      if (!row) return null;
      const next = { ...row, ...defined(data) } as PageBlock;
      rows.set(id, next);
      return next;
    },
    delete: async (id: string) => {
      rows.delete(id);
    },
  });
};
const block = (overrides: Partial<CreatePageBlockDto> = {}) => ({ page: "about", section: "objectives", title: "Unity", ...overrides }) as CreatePageBlockDto;

test("blocks: items need content, media needs a valid URL, buttons need a link", async () => {
  const service = new PageBlocksService(fakeRepository());
  const item = await service.create(block({ body: "  Together  ", sortOrder: 2 }));
  assert.equal(item.role, "ITEM");
  assert.equal(item.body, "Together");
  assert.equal(item.mediaType, "NONE");
  const hero = await service.create(block({ section: "hero", role: "INTRO", title: null, mediaType: "IMAGE", mediaUrl: "/uploads/hero.jpg" }));
  assert.equal(hero.role, "INTRO");
  const video = await service.create(block({ section: "organization", mediaType: "VIDEO", mediaUrl: "https://youtu.be/dQw4w9WgXcQ" }));
  assert.equal(video.mediaUrl, "https://youtu.be/dQw4w9WgXcQ");
  const ignored = await service.create(block({ mediaUrl: "/uploads/unused.jpg" }));
  assert.equal(ignored.mediaUrl, null, "media URL is dropped when the type is NONE");
  await rejectsWith(service.create(block({ title: null })), 400, "Add a title, text, image or video.");
  await rejectsWith(service.create(block({ mediaType: "IMAGE" })), 400, "Add an image.");
  await rejectsWith(service.create(block({ mediaType: "VIDEO", mediaUrl: "https://vimeo.com/1" })), 400, /YouTube link/);
  await rejectsWith(service.create(block({ mediaType: "IMAGE", mediaUrl: "javascript:alert(1)" })), 400, /media URL/);
  await rejectsWith(service.create(block({ ctaLabel: "Apply" })), 400, "Add a link for the button text.");
  await rejectsWith(service.create(block({ body: "<script>" })), 400, /cannot contain/);
});

test("the public sees one page's active blocks; admins see all; updates keep unsent fields", async () => {
  const service = new PageBlocksService(fakeRepository());
  const first = await service.create(block({ linkUrl: "/register", ctaLabel: "Join" }));
  await service.create(block({ title: "Hidden", active: false }));
  await service.create(block({ page: "careers", section: "job-opportunities", title: "Accountant" }));
  assert.deepEqual(
    (await service.list({ page: "about" }, null)).map((row) => row.title),
    ["Unity"],
  );
  assert.equal((await service.list({ page: "about" }, admin())).length, 2);
  assert.equal((await service.list({}, null)).length, 2);
  const moved = await service.update(first.id, { section: "vision-mission", sortOrder: 4 });
  assert.equal(moved.section, "vision-mission");
  assert.equal(moved.ctaLabel, "Join");
  await rejectsWith(service.update(first.id, { linkUrl: null }), 400, "Add a link for the button text.");
  const withImage = await service.update(first.id, { mediaType: "IMAGE", mediaUrl: "/uploads/a.jpg" });
  assert.equal(withImage.mediaUrl, "/uploads/a.jpg");
  const noMedia = await service.update(first.id, { mediaType: "NONE" });
  assert.equal(noMedia.mediaUrl, null);
  await rejectsWith(service.update("missing", { title: "x" }), 404, "Record not found");
  await service.remove(first.id);
  assert.equal((await service.list({ page: "about" }, admin())).length, 1);
});
