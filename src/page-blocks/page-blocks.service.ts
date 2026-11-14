import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import type { CreatePageBlockDto, PageBlockListQueryDto, UpdatePageBlockDto } from "./dto/page-blocks.dto.js";
import { PageBlocksRepository } from "./page-blocks.repository.js";
import { checkPageBlock } from "./page-blocks.rules.js";
import { type PageBlockVo, toPageBlockVo } from "./vo/page-blocks.vo.js";

// undefined = not sent (keep), null or blank = clear.
const clean = (value: string | null | undefined): string | null | undefined => (value === undefined ? undefined : value?.trim() || null);
const keep = <T>(sent: T | undefined, current: T): T => (sent === undefined ? current : sent);

const optionalFields = (input: UpdatePageBlockDto) => ({
  role: input.role,
  title: clean(input.title),
  titleHi: clean(input.titleHi),
  subtitle: clean(input.subtitle),
  subtitleHi: clean(input.subtitleHi),
  body: clean(input.body),
  bodyHi: clean(input.bodyHi),
  mediaType: input.mediaType,
  mediaUrl: clean(input.mediaUrl),
  linkUrl: clean(input.linkUrl),
  ctaLabel: clean(input.ctaLabel),
  ctaLabelHi: clean(input.ctaLabelHi),
  sortOrder: input.sortOrder,
  active: input.active,
});

// Admin-managed content of the public menu pages.
@Injectable()
export class PageBlocksService {
  constructor(private readonly repository: PageBlocksRepository) {}

  // Public: active blocks only. Admins see everything.
  async list(query: PageBlockListQueryDto, user: UserRow | null): Promise<PageBlockVo[]> {
    const admin = user?.role === "admin";
    const rows = await this.repository.list({ ...(query.page ? { page: query.page } : {}), ...(admin ? {} : { active: true }) });
    return rows.map(toPageBlockVo);
  }

  async create(input: CreatePageBlockDto): Promise<PageBlockVo> {
    assertNoMarkup(input);
    const fields = optionalFields(input);
    const mediaType = fields.mediaType ?? "NONE";
    checkPageBlock({
      role: fields.role ?? "ITEM",
      title: fields.title ?? null,
      body: fields.body ?? null,
      mediaType,
      mediaUrl: mediaType === "NONE" ? null : (fields.mediaUrl ?? null),
      linkUrl: fields.linkUrl ?? null,
      ctaLabel: fields.ctaLabel ?? null,
    });
    const row = await this.repository.create({
      id: randomId(),
      page: input.page,
      section: input.section,
      ...fields,
      mediaType,
      mediaUrl: mediaType === "NONE" ? null : fields.mediaUrl,
    });
    return toPageBlockVo(row);
  }

  // The whole block (stored values + changes) is re-checked, so an update can't leave it invalid.
  async update(id: string, input: UpdatePageBlockDto): Promise<PageBlockVo> {
    assertNoMarkup(input);
    const existing = await this.repository.findById(id);
    if (!existing) throw new ApiError(404, "Record not found");
    const fields = optionalFields(input);
    const mediaType = keep(fields.mediaType, existing.mediaType);
    const mediaUrl = mediaType === "NONE" ? null : keep(fields.mediaUrl, existing.mediaUrl);
    checkPageBlock({
      role: keep(fields.role, existing.role),
      title: keep(fields.title, existing.title),
      body: keep(fields.body, existing.body),
      mediaType,
      mediaUrl,
      linkUrl: keep(fields.linkUrl, existing.linkUrl),
      ctaLabel: keep(fields.ctaLabel, existing.ctaLabel),
    });
    const row = await this.repository.update(id, { ...(input.section !== undefined ? { section: input.section } : {}), ...fields, mediaType, mediaUrl });
    if (!row) throw new ApiError(404, "Record not found");
    return toPageBlockVo(row);
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
