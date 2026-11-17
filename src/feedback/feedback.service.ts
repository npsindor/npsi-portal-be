import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { RECAPTCHA_FAILED, RecaptchaService } from "../common/recaptcha/recaptcha.service.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import { toJsonInput } from "../common/utils/json.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { pick } from "../common/utils/objects.js";
import { OWN_UPLOAD_URL } from "../common/utils/uploads.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import type { CreateFeedbackDto, FeedbackListQueryDto, UpdateFeedbackDto } from "./dto/feedback.dto.js";
import type { PublicMessageDto } from "./dto/public-message.dto.js";
import { FeedbackRepository } from "./feedback.repository.js";
import { type FeedbackVo, toFeedbackVo } from "./vo/feedback.vo.js";

// The fields a member chooses on the feedback form. Who sent it (name, email, family) and where it is in
// the admin workflow (status, date) are set by the server; replies and notes are admin-only.
const MEMBER_FIELDS = ["feedbackType", "subject", "message", "attachmentUrl", "questions", "rating"] as const;
// Survey answers are small; this stops one account storing megabytes per row.
const MAX_QUESTIONS_JSON = 10_000;
// Member feedback; admins reply, annotate and archive it.
@Injectable()
export class FeedbackService {
  constructor(
    private readonly repo: FeedbackRepository,
    private readonly recaptcha: RecaptchaService,
    private readonly membership: MembershipRepository,
  ) {}

  // Public Contact Us / Feedback message (no login, reCAPTCHA): saved as feedback for the admin, never published.
  async createPublic(dto: PublicMessageDto): Promise<{ reference: string }> {
    if (!(await this.recaptcha.verify(dto.recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    if (dto.kind === "CONTACT" && !dto.email && !dto.mobile) throw new ApiError(400, "Give an email or mobile number so we can reply.");
    const input = { name: dto.name, email: dto.email, mobile: dto.mobile, category: dto.category, subject: dto.subject, message: dto.message };
    assertNoMarkup(input);
    const mobile = dto.mobile?.replace(/\D/g, "").slice(-10);
    const row = await createWithDisplayId(
      "FB-",
      (prefix) => this.repo.latestDisplayIds(prefix),
      (feedbackId) =>
        this.repo.create({
          id: randomId(),
          feedbackId,
          memberName: dto.name || (dto.lang === "hi" ? "आगंतुक" : "Visitor"),
          email: dto.email ?? null,
          feedbackType: `${dto.kind === "CONTACT" ? "Contact enquiry" : "Public feedback"} · ${dto.category}`.slice(0, 255),
          subject: dto.subject ?? null,
          message: mobile ? `${dto.message}\n\nMobile: ${mobile}` : dto.message,
          questions: { source: "PUBLIC_WEBSITE", kind: dto.kind, category: dto.category, mobile: mobile ?? null, lang: dto.lang ?? "en" },
          status: "Submitted",
          submittedDate: new Date(),
        }),
    );
    return { reference: row.feedbackId as string };
  }

  async list(query: FeedbackListQueryDto): Promise<FeedbackVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toFeedbackVo);
  }

  async create(dto: CreateFeedbackDto, user: UserRow): Promise<FeedbackVo> {
    const input: CreateFeedbackDto = user.role === "admin" ? { ...dto } : await this.memberInput(dto, user);
    const row = await createWithDisplayId(
      "FB-",
      (prefix) => this.repo.latestDisplayIds(prefix),
      (feedbackId) => this.repo.create({ id: randomId(), feedbackId, ...toCreateData(input) }),
    );
    return toFeedbackVo(row);
  }

  // A member's feedback is always filed as themselves (so it shows in their own "my feedback" list,
  // which matches by email) and enters the admin queue as a new, unanswered item.
  private async memberInput(dto: CreateFeedbackDto, user: UserRow): Promise<CreateFeedbackDto> {
    const input: CreateFeedbackDto = {
      ...pick(dto, MEMBER_FIELDS),
      memberName: user.fullName?.trim() || dto.memberName,
      email: user.email,
      familyId: await this.membership.ownFamilyId(user),
      status: "Submitted",
      submittedDate: new Date().toISOString(),
    };
    assertNoMarkup(pick(input, ["memberName", "feedbackType", "subject", "message", "attachmentUrl", "questions"]));
    const attachment = input.attachmentUrl?.trim();
    if (attachment && !OWN_UPLOAD_URL.test(attachment)) throw new ApiError(400, "The attachment must be an image uploaded to the portal.");
    if (input.questions !== undefined && JSON.stringify(input.questions ?? null).length > MAX_QUESTIONS_JSON)
      throw new ApiError(400, "The survey answers are too long.");
    return input;
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
});
