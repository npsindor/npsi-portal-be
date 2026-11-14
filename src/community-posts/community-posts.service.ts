import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { CommunityPostsRepository } from "./community-posts.repository.js";
import { checkCommunityPost } from "./community-posts.rules.js";
import type { CommunityPostListQueryDto, CreateCommunityPostDto, UpdateCommunityPostDto } from "./dto/community-posts.dto.js";
import { type CommunityPostVo, toCommunityPostVo } from "./vo/community-posts.vo.js";

// undefined = not sent (keep), null or blank = clear.
const clean = (value: string | null | undefined): string | null | undefined => (value === undefined ? undefined : value?.trim() || null);
const asDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined ? undefined : value ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : null;
const keep = <T>(sent: T | undefined, current: T): T => (sent === undefined ? current : sent);

const optionalFields = (input: UpdateCommunityPostDto) => ({
  titleHi: clean(input.titleHi),
  body: clean(input.body),
  bodyHi: clean(input.bodyHi),
  imageUrl: clean(input.imageUrl),
  eventDate: asDate(input.eventDate),
  location: clean(input.location),
  locationHi: clean(input.locationHi),
  contactName: clean(input.contactName),
  contactPhone: clean(input.contactPhone),
  linkUrl: clean(input.linkUrl),
  ctaLabel: clean(input.ctaLabel),
  ctaLabelHi: clean(input.ctaLabelHi),
  featured: input.featured,
  sortOrder: input.sortOrder,
  active: input.active,
});

// Admin-managed Community Services page: blood donation, emergency help, social welfare.
@Injectable()
export class CommunityPostsService {
  constructor(private readonly repository: CommunityPostsRepository) {}

  // Public: active posts only. Admins see everything.
  async list(query: CommunityPostListQueryDto, user: UserRow | null): Promise<CommunityPostVo[]> {
    const admin = user?.role === "admin";
    const rows = await this.repository.list({ ...(query.section ? { section: query.section } : {}), ...(admin ? {} : { active: true }) });
    return rows.map(toCommunityPostVo);
  }

  async create(input: CreateCommunityPostDto): Promise<CommunityPostVo> {
    assertNoMarkup(input);
    const fields = optionalFields(input);
    checkCommunityPost({
      title: input.title,
      imageUrl: fields.imageUrl ?? null,
      linkUrl: fields.linkUrl ?? null,
      ctaLabel: fields.ctaLabel ?? null,
      contactPhone: fields.contactPhone ?? null,
    });
    const row = await this.repository.create({ id: randomId(), section: input.section, title: input.title.trim(), ...fields });
    return toCommunityPostVo(row);
  }

  // The whole post (stored values + changes) is re-checked, so an update can't leave it invalid.
  async update(id: string, input: UpdateCommunityPostDto): Promise<CommunityPostVo> {
    assertNoMarkup(input);
    const existing = await this.repository.findById(id);
    if (!existing) throw new ApiError(404, "Record not found");
    const fields = optionalFields(input);
    checkCommunityPost({
      title: input.title ?? existing.title,
      imageUrl: keep(fields.imageUrl, existing.imageUrl),
      linkUrl: keep(fields.linkUrl, existing.linkUrl),
      ctaLabel: keep(fields.ctaLabel, existing.ctaLabel),
      contactPhone: keep(fields.contactPhone, existing.contactPhone),
    });
    const row = await this.repository.update(id, {
      ...(input.section !== undefined ? { section: input.section } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...fields,
    });
    if (!row) throw new ApiError(404, "Record not found");
    return toCommunityPostVo(row);
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
