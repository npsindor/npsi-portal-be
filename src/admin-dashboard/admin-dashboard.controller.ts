import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard } from "../common/guards/auth.guards.js";
import { PrismaService } from "../database/prisma.service.js";

const MONTHS = 12;

export class MonthPointVo {
  @ApiProperty({ example: "2026-11" }) month!: string;
  @ApiProperty({ example: 12, description: "Count in that month" }) count!: number;
}

export class TransactionMonthVo {
  @ApiProperty({ example: "2026-11" }) month!: string;
  @ApiProperty({ example: 25000, description: "Amount received (SUCCESS / VERIFIED)" }) received!: number;
  @ApiProperty({ example: 3000, description: "Amount still pending" }) pending!: number;
  @ApiProperty({ example: 500, description: "Amount failed, rejected or refunded" }) other!: number;
  @ApiProperty({ example: 14 }) count!: number;
}

export class SliceVo {
  @ApiProperty({ example: "Registration Fee" }) name!: string;
  @ApiProperty({ example: 12000 }) value!: number;
  @ApiProperty({ example: 24 }) count!: number;
}

export class DashboardChartsVo {
  @ApiProperty({ type: TransactionMonthVo, isArray: true, description: "Last 12 months, oldest first" }) transactions!: TransactionMonthVo[];
  @ApiProperty({ type: SliceVo, isArray: true, description: "Received amount by transaction type (all time)" }) transactionTypes!: SliceVo[];
  @ApiProperty({ type: SliceVo, isArray: true, description: "Transactions by payment status (all time)" }) transactionStatuses!: SliceVo[];
  @ApiProperty({ type: MonthPointVo, isArray: true, description: "New user accounts per month" }) users!: MonthPointVo[];
  @ApiProperty({ type: MonthPointVo, isArray: true, description: "Family registration applications per month" }) familyRegistrations!: MonthPointVo[];
  @ApiProperty({ type: MonthPointVo, isArray: true, description: "Student registration applications per month" }) studentRegistrations!: MonthPointVo[];
  @ApiProperty({ example: { total: 120, active: 110, verified: 115, admins: 2 } }) userTotals!: {
    total: number;
    active: number;
    verified: number;
    admins: number;
  };
}

const RECEIVED = ["SUCCESS", "VERIFIED", "PAID", "COMPLETED"];
const PENDING = ["PENDING", "SUBMITTED", "PENDING_VERIFICATION", "REFUND_REQUESTED", "REFUND_PROCESSING"];
const monthOf = (date: Date) => date.toISOString().slice(0, 7);

// Charts for the admin dashboard, counted in the database's own records (UTC months): no personal data leaves.
@Injectable()
export class AdminDashboardService {
  constructor(private readonly db: PrismaService) {}

  async charts(now = new Date()): Promise<DashboardChartsVo> {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));
    const months = Array.from({ length: MONTHS }, (_, index) => monthOf(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1))));
    const [transactions, allTransactions, users, families, students, userTotals] = await Promise.all([
      this.db.transaction.findMany({
        where: { OR: [{ date: { gte: start } }, { date: null, createdAt: { gte: start } }] },
        select: { amount: true, paymentStatus: true, date: true, createdAt: true },
      }),
      this.db.transaction.findMany({ select: { amount: true, paymentStatus: true, type: true } }),
      this.db.user.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      this.db.application.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true, submittedDate: true } }),
      this.db.studentApplication.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true, submittedDate: true } }),
      Promise.all([
        this.db.user.count(),
        this.db.user.count({ where: { status: "active" } }),
        this.db.user.count({ where: { isVerified: true } }),
        this.db.user.count({ where: { role: "admin" } }),
      ]),
    ]);
    const perMonth = (dates: Date[]): MonthPointVo[] => {
      const counts = new Map(months.map((month) => [month, 0]));
      for (const date of dates) {
        const month = monthOf(date);
        if (counts.has(month)) counts.set(month, (counts.get(month) ?? 0) + 1);
      }
      return months.map((month) => ({ month, count: counts.get(month) ?? 0 }));
    };
    const money = new Map(months.map((month) => [month, { month, received: 0, pending: 0, other: 0, count: 0 }]));
    for (const row of transactions) {
      const point = money.get(monthOf(row.date ?? row.createdAt));
      if (!point) continue;
      const amount = row.amount.toNumber();
      const status = String(row.paymentStatus || "PENDING").toUpperCase();
      if (RECEIVED.includes(status)) point.received += amount;
      else if (PENDING.includes(status)) point.pending += amount;
      else point.other += amount;
      point.count += 1;
    }
    const group = (key: (row: (typeof allTransactions)[number]) => string, received: boolean): SliceVo[] => {
      const slices = new Map<string, SliceVo>();
      for (const row of allTransactions) {
        if (received && !RECEIVED.includes(String(row.paymentStatus || "").toUpperCase())) continue;
        const name = key(row) || "Other";
        const slice = slices.get(name) ?? { name, value: 0, count: 0 };
        slice.value += row.amount.toNumber();
        slice.count += 1;
        slices.set(name, slice);
      }
      return [...slices.values()].sort((a, b) => b.value - a.value);
    };
    const [total, active, verified, admins] = userTotals;
    return {
      transactions: [...money.values()].map((point) => ({
        ...point,
        received: Math.round(point.received),
        pending: Math.round(point.pending),
        other: Math.round(point.other),
      })),
      transactionTypes: group((row) => row.type, true),
      transactionStatuses: group((row) => String(row.paymentStatus || "PENDING").toUpperCase(), false),
      users: perMonth(users.map((row) => row.createdAt)),
      familyRegistrations: perMonth(families.map((row) => row.submittedDate ?? row.createdAt)),
      studentRegistrations: perMonth(students.map((row) => row.submittedDate ?? row.createdAt)),
      userTotals: { total, active, verified, admins },
    };
  }
}

@ApiTags("Admin dashboard")
@ApiBearerAuth()
@Controller("admin-dashboard")
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}

  @Get("charts")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Admin: monthly transactions, new users and registrations for the dashboard charts" })
  @ApiOkResponse({ type: DashboardChartsVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  charts(): Promise<DashboardChartsVo> {
    return this.service.charts();
  }
}

@Module({ controllers: [AdminDashboardController], providers: [AdminDashboardService] })
export class AdminDashboardModule {}
