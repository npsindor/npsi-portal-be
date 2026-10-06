import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CreateTransactionDto, TransactionListQueryDto, UpdateTransactionDto } from "./dto/transactions.dto.js";
import { TransactionsRepository } from "./transactions.repository.js";
import { type TransactionVo, toTransactionVo } from "./vo/transactions.vo.js";

// Payments, managed by admins. The registration and event-registration flows
// record their own payments (see ApplicationsService, EventRegistrationsService).
@Injectable()
export class TransactionsService {
  constructor(private readonly repo: TransactionsRepository) {}

  async list(query: TransactionListQueryDto): Promise<TransactionVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT);
    return rows.map(toTransactionVo);
  }

  async create(dto: CreateTransactionDto): Promise<TransactionVo> {
    return toTransactionVo(await this.repo.create({ id: randomId(), ...toCreateData(dto) }));
  }

  async update(id: string, dto: UpdateTransactionDto): Promise<TransactionVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toTransactionVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
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
