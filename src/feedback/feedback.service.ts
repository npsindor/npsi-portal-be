import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import { toJsonInput } from "../common/utils/json.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { pick } from "../common/utils/objects.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CreateFeedbackDto, FeedbackListQueryDto, UpdateFeedbackDto } from "./dto/feedback.dto.js";
import { FeedbackRepository } from "./feedback.repository.js";
import { type FeedbackVo, toFeedbackVo } from "./vo/feedback.vo.js";

// The fields the member's feedback form sends; replies and notes are admin-only.
const MEMBER_FIELDS = [
  "memberName",
  "familyId",
  "email",
  "feedbackType",
  "subject",
  "message",
  "attachmentUrl",
  "status",
  "submittedDate",
  "questions",
  "rating",
] as const;
// Member feedback; admins reply, annotate and archive it.
@Injectable()
export class FeedbackService {
  constructor(private readonly repo: FeedbackRepository) {}

  async list(query: FeedbackListQueryDto): Promise<FeedbackVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toFeedbackVo);
  }

  async create(dto: CreateFeedbackDto, user: UserRow): Promise<FeedbackVo> {
    const input: CreateFeedbackDto = user.role === "admin" ? { ...dto } : pick(dto, MEMBER_FIELDS);
    if (user.role !== "admin") assertNoMarkup(input);
    const row = await createWithDisplayId(
      "FB-",
      (prefix) => this.repo.latestDisplayIds(prefix),
      (feedbackId) => this.repo.create({ id: randomId(), feedbackId, ...toCreateData(input) }),
    );
    return toFeedbackVo(row);
  }

  async update(id: string, dto: UpdateFeedbackDto): Promise<FeedbackVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toFeedbackVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateFeedbackDto): Omit<Prisma.FeedbackUncheckedCreateInput, "id" | "feedbackId"> => ({
  memberName: input.memberName,
  familyId: input.familyId,
  email: input.email,
  feedbackType: input.feedbackType,
  subject: input.subject,
  message: input.message,
  attachmentUrl: input.attachmentUrl,
  questions: toJsonInput(input.questions),
  rating: input.rating,
  status: input.status,
  reply: input.reply,
  repliedDate: parseDate(input.repliedDate),
  repliedById: input.repliedById,
  internalNote: input.internalNote,
  archived: input.archived,
  submittedDate: parseDate(input.submittedDate),
});

const toUpdateData = (input: UpdateFeedbackDto): Prisma.FeedbackUncheckedUpdateInput => ({
  memberName: input.memberName,
  familyId: input.familyId,
  email: input.email,
  feedbackType: input.feedbackType,
  subject: input.subject,
  message: input.message,
  attachmentUrl: input.attachmentUrl,
  questions: toJsonInput(input.questions),
  rating: input.rating,
  status: input.status,
  reply: input.reply,
  repliedDate: parseDate(input.repliedDate),
  repliedById: input.repliedById,
  internalNote: input.internalNote,
  archived: input.archived,
  submittedDate: parseDate(input.submittedDate),
  updatedAt: new Date(),
});
