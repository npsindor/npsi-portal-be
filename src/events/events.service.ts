import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CreateEventDto, EventListQueryDto, UpdateEventDto } from "./dto/events.dto.js";
import { EventsRepository } from "./events.repository.js";
import { type EventVo, toEventVo } from "./vo/events.vo.js";

@Injectable()
export class EventsService {
  constructor(private readonly repo: EventsRepository) {}

  // Drafts and archived ones are only for admins.
  async list(query: EventListQueryDto, user: UserRow | null): Promise<EventVo[]> {
    const where: Prisma.EventWhereInput = user?.role === "admin" ? {} : { status: "PUBLISHED" };
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toEventVo);
  }

  async create(dto: CreateEventDto): Promise<EventVo> {
    return toEventVo(await this.repo.create({ id: randomId(), ...toCreateData(dto) }));
  }

  async update(id: string, dto: UpdateEventDto): Promise<EventVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toEventVo(row);
  }

  // An event with registrations (and their payments) can't be deleted; cancel or archive it instead.
  async remove(id: string): Promise<void> {
    if (await this.repo.hasRegistrations(id)) throw new ApiError(409, "This event has registrations, so it can't be deleted. Archive it instead.");
    await this.repo.delete(id);
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateEventDto): Omit<Prisma.EventUncheckedCreateInput, "id"> => ({
  title: input.title,
  slug: input.slug,
  bannerUrl: input.bannerUrl,
  description: input.description,
  date: parseDate(input.date),
  startTime: input.startTime,
  endTime: input.endTime,
  venue: input.venue,
  mapLocation: input.mapLocation,
  organizer: input.organizer,
  contact: input.contact,
  registrationOpen: parseDate(input.registrationOpen),
  registrationClose: parseDate(input.registrationClose),
  fee: input.fee,
  capacity: input.capacity,
  rules: input.rules,
  terms: input.terms,
  status: input.status,
  titleHi: input.titleHi,
  descriptionHi: input.descriptionHi,
});

const toUpdateData = (input: UpdateEventDto): Prisma.EventUncheckedUpdateInput => ({
  title: input.title,
  slug: input.slug,
  bannerUrl: input.bannerUrl,
  description: input.description,
  date: parseDate(input.date),
  startTime: input.startTime,
  endTime: input.endTime,
  venue: input.venue,
  mapLocation: input.mapLocation,
  organizer: input.organizer,
  contact: input.contact,
  registrationOpen: parseDate(input.registrationOpen),
  registrationClose: parseDate(input.registrationClose),
  fee: input.fee,
  capacity: input.capacity,
  rules: input.rules,
  terms: input.terms,
  status: input.status,
  titleHi: input.titleHi,
  descriptionHi: input.descriptionHi,
});
