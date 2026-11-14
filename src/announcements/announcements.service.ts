import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AnnouncementsRepository } from "./announcements.repository.js";
import type { AnnouncementListQueryDto, CreateAnnouncementDto, UpdateAnnouncementDto } from "./dto/announcements.dto.js";
import { type AnnouncementVo, toAnnouncementVo } from "./vo/announcements.vo.js";

@Injectable()
export class AnnouncementsService {
  constructor(private readonly repo: AnnouncementsRepository) {}

  // Drafts, archived and not-yet-scheduled ones are only for admins.
  async list(query: AnnouncementListQueryDto, user: UserRow | null): Promise<AnnouncementVo[]> {
    const visible: Prisma.AnnouncementWhereInput =
      user?.role === "admin" ? {} : { status: "Active", OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] };
    const where: Prisma.AnnouncementWhereInput = { ...visible, ...(query.category ? { category: query.category } : {}) };
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toAnnouncementVo);
  }

  async create(dto: CreateAnnouncementDto, admin?: UserRow | null): Promise<AnnouncementVo> {
    assertOwnImage(dto.imageUrl);
    const id = randomId();
    return toAnnouncementVo(await this.repo.create({ id, ...toCreateData(dto), slug: slugFor(dto.title, id), author: admin?.fullName || null }));
  }

  async update(id: string, dto: UpdateAnnouncementDto): Promise<AnnouncementVo> {
    assertOwnImage(dto.imageUrl);
    const row = await this.repo.update(id, { ...toUpdateData(dto), ...(dto.title ? { slug: slugFor(dto.title, id) } : {}) });
    if (!row) throw new ApiError(404, "Record not found");
    return toAnnouncementVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

// Only images uploaded to this portal may be used as the featured image.
const OWN_UPLOAD = /^https?:\/\/[^/\s]+\/uploads\/[0-9a-f-]{36}\.(?:jpe?g|png|webp|gif)$/i;
const assertOwnImage = (url: string | null | undefined) => {
  if (url && !OWN_UPLOAD.test(url)) throw new ApiError(400, "The image must be uploaded to the portal.");
};
// "Diwali Milan 2026" → "diwali-milan-2026-1a2b3c" (readable, and unique through the id suffix).
const slugFor = (title: string, id: string): string => {
  const base = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
  return `${base || "sandesh"}-${id.replace(/-/g, "").slice(0, 6)}`;
};

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateAnnouncementDto): Omit<Prisma.AnnouncementUncheckedCreateInput, "id"> => ({
  title: input.title,
  body: input.body,
  date: parseDate(input.date),
  type: input.type,
  status: input.status,
  titleHi: input.titleHi,
  bodyHi: input.bodyHi,
  category: input.category,
  imageUrl: input.imageUrl,
  publishAt: parseDate(input.publishAt),
});

const toUpdateData = (input: UpdateAnnouncementDto): Prisma.AnnouncementUncheckedUpdateInput => ({
  title: input.title,
  body: input.body,
  date: parseDate(input.date),
  type: input.type,
  status: input.status,
  titleHi: input.titleHi,
  bodyHi: input.bodyHi,
  category: input.category,
  imageUrl: input.imageUrl,
  publishAt: parseDate(input.publishAt),
});
