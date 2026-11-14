import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { indiaToday } from "../safar-saathi/safar.rules.js";
import type { CreateHomeHighlightDto, HomeHighlightListQueryDto, UpdateHomeHighlightDto } from "./dto/home-highlights.dto.js";
import { HomeHighlightsRepository } from "./home-highlights.repository.js";
import { checkHighlight, isLive } from "./home-highlights.rules.js";
import { type HomeHighlightVo, toHomeHighlightVo } from "./vo/home-highlights.vo.js";

// undefined = not sent (keep), null or blank = clear.
const clean = (value: string | null | undefined): string | null | undefined => (value === undefined ? undefined : value?.trim() || null);
const day = (value: string | null | undefined): string | null | undefined => (value === undefined ? undefined : value ? value.slice(0, 10) : null);
const asDate = (value: string | null | undefined): Date | null | undefined => (value === undefined ? undefined : value ? new Date(`${value}T00:00:00Z`) : null);
const keep = <T>(sent: T | undefined, current: T): T => (sent === undefined ? current : sent);

const optionalFields = (input: UpdateHomeHighlightDto) => ({
  sponsored: input.sponsored,
  eyebrow: clean(input.eyebrow),
  eyebrowHi: clean(input.eyebrowHi),
  titleHi: clean(input.titleHi),
  body: clean(input.body),
  bodyHi: clean(input.bodyHi),
  mediaUrl: clean(input.mediaUrl),
  linkUrl: clean(input.linkUrl),
  ctaLabel: clean(input.ctaLabel),
  ctaLabelHi: clean(input.ctaLabelHi),
  startDate: day(input.startDate),
  endDate: day(input.endDate),
  sortOrder: input.sortOrder,
  active: input.active,
});
type OptionalFields = ReturnType<typeof optionalFields>;
const toData = ({ startDate, endDate, ...rest }: OptionalFields) => ({ ...rest, startDate: asDate(startDate), endDate: asDate(endDate) });

// Admin-managed slides of the homepage "Community highlights" section.
@Injectable()
export class HomeHighlightsService {
  constructor(private readonly repository: HomeHighlightsRepository) {}

  // Public: only active slides inside their date window. Admins see everything.
  async list(query: HomeHighlightListQueryDto, user: UserRow | null): Promise<HomeHighlightVo[]> {
    const admin = user?.role === "admin";
    const rows = await this.repository.list({ ...(query.slider ? { slider: query.slider } : {}), ...(admin ? {} : { active: true }) });
    const today = indiaToday();
    return rows.map(toHomeHighlightVo).filter((row) => admin || isLive(row, today));
  }

  async create(input: CreateHomeHighlightDto): Promise<HomeHighlightVo> {
    assertNoMarkup(input);
    const fields = optionalFields(input);
    const mediaType = input.slider === "TEXT" ? "TEXT" : (input.mediaType ?? "IMAGE");
    checkHighlight({
      slider: input.slider,
      mediaType,
      title: input.title,
      mediaUrl: fields.mediaUrl ?? null,
      linkUrl: fields.linkUrl ?? null,
      ctaLabel: fields.ctaLabel ?? null,
      startDate: fields.startDate ?? null,
      endDate: fields.endDate ?? null,
    });
    const row = await this.repository.create({ id: randomId(), slider: input.slider, mediaType, title: input.title.trim(), ...toData(fields) });
    return toHomeHighlightVo(row);
  }

  // The whole slide (stored values + changes) is re-checked, so an update can't leave it invalid.
  async update(id: string, input: UpdateHomeHighlightDto): Promise<HomeHighlightVo> {
    assertNoMarkup(input);
    const existing = await this.repository.findById(id);
    if (!existing) throw new ApiError(404, "Record not found");
    const current = toHomeHighlightVo(existing);
    const fields = optionalFields(input);
    const mediaType = existing.slider === "TEXT" ? "TEXT" : (input.mediaType ?? existing.mediaType);
    checkHighlight({
      slider: existing.slider,
      mediaType,
      title: input.title ?? existing.title,
      mediaUrl: keep(fields.mediaUrl, current.mediaUrl),
      linkUrl: keep(fields.linkUrl, current.linkUrl),
      ctaLabel: keep(fields.ctaLabel, current.ctaLabel),
      startDate: keep(fields.startDate, current.startDate),
      endDate: keep(fields.endDate, current.endDate),
    });
    const row = await this.repository.update(id, { mediaType, ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...toData(fields) });
    if (!row) throw new ApiError(404, "Record not found");
    return toHomeHighlightVo(row);
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
