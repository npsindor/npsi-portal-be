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

  // Drafts and archived ones are only for admins.
  async list(query: AnnouncementListQueryDto, user: UserRow | null): Promise<AnnouncementVo[]> {
    const where: Prisma.AnnouncementWhereInput = user?.role === "admin" ? {} : { status: "Active" };
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toAnnouncementVo);
  }

  async create(dto: CreateAnnouncementDto): Promise<AnnouncementVo> {
    return toAnnouncementVo(await this.repo.create({ id: randomId(), ...toCreateData(dto) }));
  }

  async update(id: string, dto: UpdateAnnouncementDto): Promise<AnnouncementVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toAnnouncementVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateAnnouncementDto): Omit<Prisma.AnnouncementUncheckedCreateInput, "id"> => ({
  title: input.title,
  body: input.body,
  date: parseDate(input.date),
  type: input.type,
  status: input.status,
  titleHi: input.titleHi,
  bodyHi: input.bodyHi,
});

const toUpdateData = (input: UpdateAnnouncementDto): Prisma.AnnouncementUncheckedUpdateInput => ({
  title: input.title,
  body: input.body,
  date: parseDate(input.date),
  type: input.type,
  status: input.status,
  titleHi: input.titleHi,
  bodyHi: input.bodyHi,
});
