import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { EventsRepository } from "../events/events.repository.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import type { CreateTransactionDto, TransactionListQueryDto, UpdateTransactionDto } from "./dto/transactions.dto.js";
import { TransactionsRepository } from "./transactions.repository.js";
import { type TransactionVo, toTransactionVo } from "./vo/transactions.vo.js";
// Payments. There is no payment gateway: non-admins can only record a
// payment as PENDING (free events excepted) and admins reconcile them.
@Injectable()
export class TransactionsService {
  constructor(
    private readonly repo: TransactionsRepository,
    private readonly membership: MembershipRepository,
    private readonly events: EventsRepository,
  ) {}

  async list(query: TransactionListQueryDto): Promise<TransactionVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT);
    return rows.map(toTransactionVo);
  }

  async create(dto: CreateTransactionDto, user: UserRow | null): Promise<TransactionVo> {
    const input = { ...dto };
    if (user?.role !== "admin") {
      assertNoMarkup(input);
      await this.applyNonAdminRules(input, user);
    }
    return toTransactionVo(await this.repo.create({ id: randomId(), ...toCreateData(input) }));
  }

  async update(id: string, dto: UpdateTransactionDto): Promise<TransactionVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toTransactionVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  // Either the registration fee of an application submitted moments ago (once),
  // or a logged-in member's event fee for their own family.
  private async applyNonAdminRules(input: CreateTransactionDto, user: UserRow | null): Promise<void> {
    if (input.amount < 0) throw new ApiError(400, "Amount must be zero or more.");
    if ((await this.membership.recentApplicationKind(input.referenceId)) === "Application") {
      if (await this.repo.existsForReference(input.referenceId as string))
        throw new ApiError(409, "A registration fee is already recorded for this application.");
      delete input.familyId;
      delete input.memberId;
      delete input.eventId;
      Object.assign(input, { type: "Family Registration", paymentStatus: "PENDING" });
      return;
    }
    if (!user) throw new ApiError(403, "Payments can only be recorded for your own registration.");
    const ownFamilyId = await this.membership.ownFamilyId(user);
    if (!ownFamilyId) throw new ApiError(403, "No family found for your account.");
    if (input.memberId && (await this.membership.familyIdOfMembership(input.memberId)) !== ownFamilyId) {
      throw new ApiError(403, "You can only pay for members of your own family.");
    }
    const fee = input.eventId ? await this.events.feeOf(input.eventId) : null;
    if (fee === null) throw new ApiError(404, "Event not found.");
    Object.assign(input, { type: "Event Registration", familyId: ownFamilyId, paymentStatus: fee === 0 ? "SUCCESS" : "PENDING" });
  }
}
// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateTransactionDto): Omit<Prisma.TransactionUncheckedCreateInput, "id"> => ({
  transactionId: input.transactionId,
  type: input.type,
  amount: input.amount,
  paymentMethod: input.paymentMethod,
  paymentStatus: input.paymentStatus,
  familyId: input.familyId,
  memberId: input.memberId,
  eventId: input.eventId,
  referenceId: input.referenceId,
  date: parseDate(input.date),
  remarks: input.remarks,
});

const toUpdateData = (input: UpdateTransactionDto): Prisma.TransactionUncheckedUpdateInput => ({
  transactionId: input.transactionId,
  type: input.type,
  amount: input.amount,
  paymentMethod: input.paymentMethod,
  paymentStatus: input.paymentStatus,
  familyId: input.familyId,
  memberId: input.memberId,
  eventId: input.eventId,
  referenceId: input.referenceId,
  date: parseDate(input.date),
  remarks: input.remarks,
  updatedAt: new Date(),
});
