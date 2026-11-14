import assert from "node:assert/strict";
import { test } from "node:test";
import type { HomeHighlight, Prisma } from "../generated/prisma/client.js";
import { indiaToday } from "../safar-saathi/safar.rules.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import type { CreateHomeHighlightDto } from "./dto/home-highlights.dto.js";
import type { HomeHighlightsRepository } from "./home-highlights.repository.js";
import { safeUrl, youtubeId } from "./home-highlights.rules.js";
import { HomeHighlightsService } from "./home-highlights.service.js";

// In-memory repository with the same contract as HomeHighlightsRepository.
const fakeRepository = () => {
  const rows = new Map<string, HomeHighlight>();
  const defaults = {
    mediaType: "TEXT",
    sponsored: false,
    eyebrow: null,
    eyebrowHi: null,
    titleHi: null,
    body: null,
    bodyHi: null,
    mediaUrl: null,
    linkUrl: null,
    ctaLabel: null,
    ctaLabelHi: null,
    startDate: null,
    endDate: null,
    sortOrder: 0,
    active: true,
  };
  const defined = (data: object) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  return {
    rows,
    repository: as<HomeHighlightsRepository>({
      list: async (where: Prisma.HomeHighlightWhereInput) =>
        [...rows.values()].filter((row) => (!where.slider || row.slider === where.slider) && (where.active === undefined || row.active === where.active)),
      findById: async (id: string) => rows.get(id) ?? null,
      create: async (data: Prisma.HomeHighlightUncheckedCreateInput) => {
        const row = { ...defaults, ...defined(data), createdAt: new Date(), updatedAt: new Date() } as HomeHighlight;
        rows.set(row.id, row);
        return row;
      },
      update: async (id: string, data: Prisma.HomeHighlightUncheckedUpdateInput) => {
        const row = rows.get(id);
        if (!row) return null;
        const next = { ...row, ...defined(data) } as HomeHighlight;
        rows.set(id, next);
        return next;
      },
      delete: async (id: string) => {
        rows.delete(id);
      },
    }),
  };
};

const create = (overrides: Partial<CreateHomeHighlightDto> = {}): CreateHomeHighlightDto =>
  ({ slider: "TEXT", title: "Unity", ...overrides }) as CreateHomeHighlightDto;
const shift = (days: number) => {
  const date = new Date(`${indiaToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test("links and media URLs: site paths and http(s) only; YouTube ids are recognised", () => {
  for (const ok of ["/events", "/uploads/a.jpg", "https://npsindore.org/x", "http://localhost:4000/uploads/a.png"]) assert.equal(safeUrl(ok), true, ok);
  for (const bad of ["javascript:alert(1)", "//evil.com", "data:image/png;base64,AA", "ftp://x", "/a b"]) assert.equal(safeUrl(bad), false, bad);
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ?t=3"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://vimeo.com/123"), null);
});

test("creating slides: text slides are always TEXT; media slides need a valid image or video", async () => {
  const { repository } = fakeRepository();
  const service = new HomeHighlightsService(repository);
  const text = await service.create(create({ mediaType: "IMAGE", body: "  Together  ", ctaLabel: "About", linkUrl: "/about" }));
  assert.equal(text.mediaType, "TEXT");
  assert.equal(text.body, "Together");
  await rejectsWith(service.create(create({ slider: "MEDIA", mediaType: "IMAGE" })), 400, "An image is required for an image slide.");
  await rejectsWith(service.create(create({ slider: "MEDIA", mediaType: "VIDEO", mediaUrl: "https://vimeo.com/1" })), 400, /YouTube link or an \.mp4/);
  await rejectsWith(service.create(create({ slider: "MEDIA", mediaType: "IMAGE", mediaUrl: "javascript:alert(1)" })), 400, /must start with https/);
  await rejectsWith(service.create(create({ ctaLabel: "Go" })), 400, "Add a link for the button text.");
  await rejectsWith(service.create(create({ startDate: "2026-12-10", endDate: "2026-12-01" })), 400, /end date/);
  await rejectsWith(service.create(create({ title: "<b>x</b>" })), 400, /cannot contain/);
  const video = await service.create(create({ slider: "MEDIA", mediaType: "VIDEO", mediaUrl: "https://youtu.be/dQw4w9WgXcQ", sponsored: true }));
  assert.equal(video.mediaType, "VIDEO");
  assert.equal(video.sponsored, true);
  const image = await service.create(create({ slider: "MEDIA", mediaUrl: "/uploads/a.jpg" }));
  assert.equal(image.mediaType, "IMAGE", "media slides default to an image");
});

test("the public sees only active slides inside their date window; admins see all", async () => {
  const { repository } = fakeRepository();
  const service = new HomeHighlightsService(repository);
  await service.create(create({ title: "Live" }));
  await service.create(create({ title: "Hidden", active: false }));
  await service.create(create({ title: "Future", startDate: shift(2) }));
  await service.create(create({ title: "Expired", endDate: shift(-1) }));
  await service.create(create({ title: "Last day", endDate: shift(0) }));
  await service.create(create({ slider: "MEDIA", title: "Ad", mediaUrl: "/uploads/ad.png", sponsored: true }));
  assert.deepEqual(
    (await service.list({ slider: "TEXT" }, null)).map((row) => row.title),
    ["Live", "Last day"],
  );
  assert.deepEqual(
    (await service.list({ slider: "TEXT" }, user())).map((row) => row.title),
    ["Live", "Last day"],
  );
  assert.equal((await service.list({ slider: "TEXT" }, admin())).length, 5);
  assert.deepEqual(
    (await service.list({}, null)).map((row) => row.title),
    ["Live", "Last day", "Ad"],
  );
});

test("updates keep unsent fields, re-check the whole slide and 404 for unknown ids", async () => {
  const { repository } = fakeRepository();
  const service = new HomeHighlightsService(repository);
  const slide = await service.create(create({ slider: "MEDIA", mediaType: "IMAGE", mediaUrl: "/uploads/a.jpg", linkUrl: "/events", ctaLabel: "Events" }));
  const moved = await service.update(slide.id, { sortOrder: 3, active: false });
  assert.equal(moved.sortOrder, 3);
  assert.equal(moved.active, false);
  assert.equal(moved.mediaUrl, "/uploads/a.jpg");
  assert.equal(moved.ctaLabel, "Events");
  await rejectsWith(service.update(slide.id, { mediaUrl: null }), 400, "An image is required for an image slide.");
  await rejectsWith(service.update(slide.id, { linkUrl: "" }), 400, "Add a link for the button text.");
  const text = await service.update(slide.id, { mediaType: "TEXT", mediaUrl: null, title: "  Join us  " });
  assert.equal(text.mediaType, "TEXT");
  assert.equal(text.mediaUrl, null);
  assert.equal(text.title, "Join us");
  await rejectsWith(service.update("missing", { title: "x" }), 404, "Record not found");
  await service.remove(slide.id);
  await service.remove(slide.id);
  assert.equal((await service.list({}, admin())).length, 0);
});
