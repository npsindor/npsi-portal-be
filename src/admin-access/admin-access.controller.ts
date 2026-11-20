import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Put, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ADMIN_AREAS } from "../common/admin-access/admin-scope.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { loginAccount } from "../common/eligibility/login-account.js";
import { ApiError } from "../common/filters/api-error.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { escapeLike } from "../common/utils/text.js";
import { PrismaService } from "../database/prisma.service.js";

export const NOT_A_MEMBER = "Admin access can only be given to an active, registered family member.";
export const SUPER_ADMIN_TARGET = "This account is already a super admin.";

export class AdminAccessDto {
  @ApiProperty({ enum: ADMIN_AREAS, isArray: true, description: "The admin work this member may do" })
  @IsArray()
  @ArrayMaxSize(ADMIN_AREAS.length)
  @IsIn(ADMIN_AREAS, { each: true, message: "Unknown admin access." })
  areas!: string[];

  @ApiProperty({ description: "All villages (also needed for student registrations, which carry no village)" })
  @IsBoolean()
  allVillages!: boolean;

  @ApiProperty({ type: String, isArray: true, example: ["Rampura", "Ghegaon"], description: "Villages, when not all" })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  villages!: string[];

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;

  @ApiPropertyOptional({ example: "Village coordinator" })
  @Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminAccessCandidatesQueryDto {
  @ApiProperty({ description: "Name, email or mobile (2+ characters)" }) @IsString() @MaxLength(100) q!: string;
}

export class AdminAccessVo {
  @ApiProperty() userId!: string;
  @ApiProperty({ nullable: true }) name!: string | null;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true, example: "NPSI-FAM-000024" }) familyId!: string | null;
  @ApiProperty({ nullable: true }) village!: string | null;
  @ApiProperty({ enum: ADMIN_AREAS, isArray: true }) areas!: string[];
  @ApiProperty() allVillages!: boolean;
  @ApiProperty({ type: String, isArray: true }) villages!: string[];
  @ApiProperty() active!: boolean;
  @ApiProperty({ nullable: true }) note!: string | null;
  @ApiProperty({ nullable: true, description: "Name or email of the admin who last changed it" }) grantedBy!: string | null;
  @ApiProperty() updatedAt!: string;
}

export class AdminAccessCandidateVo {
  @ApiProperty() userId!: string;
  @ApiProperty({ nullable: true }) name!: string | null;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) familyId!: string | null;
  @ApiProperty({ nullable: true }) village!: string | null;
  @ApiProperty({ description: "An active registered family member (only they can be given access)" }) eligible!: boolean;
  @ApiProperty({ description: "Already has admin access" }) hasAccess!: boolean;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
// Trimmed village names without repeats; the first spelling of a village is the one kept.
const clean = (values: string[]) => {
  const kept = new Map<string, string>();
  for (const value of values.map((item) => item.trim().replace(/\s+/g, " ")).filter(Boolean))
    if (!kept.has(value.toLowerCase())) kept.set(value.toLowerCase(), value);
  return [...kept.values()];
};

// Admin → Assign roles: the super admin lets registered family members do chosen admin work for chosen villages.
@Injectable()
export class AdminAccessService {
  constructor(private readonly db: PrismaService) {}

  private async familyOf(user: UserRow) {
    const account = await loginAccount(this.db, user);
    const family =
      account.type === "FAMILY" && account.status === "ACTIVE" && account.familyId
        ? await this.db.family.findFirst({ where: { familyId: account.familyId }, select: { familyId: true, village: true, nativePlace: true } })
        : null;
    return { eligible: Boolean(family), familyId: family?.familyId ?? null, village: family?.village || family?.nativePlace || null };
  }

  async list(): Promise<AdminAccessVo[]> {
    const rows = await this.db.adminAccess.findMany({ orderBy: { updatedAt: "desc" } });
    const people = await this.db.user.findMany({ where: { id: { in: [...rows.map((row) => row.userId), ...rows.map((row) => row.grantedById)] } } });
    const out: AdminAccessVo[] = [];
    for (const row of rows) {
      const user = people.find((person) => person.id === row.userId);
      if (!user) continue;
      const granter = people.find((person) => person.id === row.grantedById);
      const family = await this.familyOf(user);
      out.push({
        userId: row.userId,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        familyId: family.familyId,
        village: family.village,
        areas: strings(row.areas),
        allVillages: row.allVillages,
        villages: strings(row.villages),
        active: row.active,
        note: row.note,
        grantedBy: granter?.fullName || granter?.email || null,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return out;
  }

  async candidates(q: string): Promise<AdminAccessCandidateVo[]> {
    const text = q.trim();
    if (text.length < 2) return [];
    const digits = text.replace(/\D/g, "");
    const users = await this.db.user.findMany({
      where: {
        role: { not: "admin" },
        status: "active",
        OR: [
          { fullName: { contains: escapeLike(text) } },
          { email: { contains: escapeLike(text.toLowerCase()) } },
          ...(digits.length >= 5 ? [{ phone: { contains: escapeLike(digits) } }] : []),
        ],
      },
      orderBy: { fullName: "asc" },
      take: 15,
    });
    const granted = new Set(
      (await this.db.adminAccess.findMany({ where: { userId: { in: users.map((user) => user.id) } }, select: { userId: true } })).map((row) => row.userId),
    );
    const out: AdminAccessCandidateVo[] = [];
    for (const user of users) {
      const family = await this.familyOf(user);
      out.push({ userId: user.id, name: user.fullName, email: user.email, phone: user.phone, ...family, hasAccess: granted.has(user.id) });
    }
    return out;
  }

  async save(userId: string, dto: AdminAccessDto, admin: UserRow): Promise<AdminAccessVo> {
    assertNoMarkup(dto);
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "Account not found.");
    if (user.role === "admin") throw new ApiError(400, SUPER_ADMIN_TARGET);
    if (!(await this.familyOf(user)).eligible) throw new ApiError(400, NOT_A_MEMBER);
    const areas = [...new Set(dto.areas)];
    if (!areas.length) throw new ApiError(400, "Choose at least one admin access.");
    const villages = dto.allVillages ? [] : clean(dto.villages);
    if (!dto.allVillages && !villages.length) throw new ApiError(400, "Choose the villages, or all villages.");
    const data = { areas, villages, allVillages: dto.allVillages, active: dto.active ?? true, note: dto.note?.trim() || null, grantedById: admin.id };
    await this.db.adminAccess.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    const saved = (await this.list()).find((row) => row.userId === userId);
    if (!saved) throw new ApiError(404, "Account not found.");
    return saved;
  }

  async remove(userId: string): Promise<void> {
    await this.db.adminAccess.deleteMany({ where: { userId } });
  }
}

@ApiTags("Admin access (roles)")
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller("admin-access")
export class AdminAccessController {
  constructor(private readonly service: AdminAccessService) {}

  @Get()
  @ApiOperation({ summary: "Super admin: members with admin access, what they may do and for which villages" })
  @ApiOkResponse({ type: AdminAccessVo, isArray: true })
  @ApiForbiddenResponse({ type: ErrorVo })
  list(): Promise<AdminAccessVo[]> {
    return this.service.list();
  }

  @Get("candidates")
  @ApiOperation({ summary: "Super admin: find accounts by name, email or mobile; only active registered family members are eligible" })
  @ApiOkResponse({ type: AdminAccessCandidateVo, isArray: true })
  candidates(@Query() query: AdminAccessCandidatesQueryDto): Promise<AdminAccessCandidateVo[]> {
    return this.service.candidates(query.q);
  }

  @Put(":userId")
  @ApiOperation({ summary: "Super admin: give or change a member's admin access" })
  @ApiOkResponse({ type: AdminAccessVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "Not a registered family member, a super admin, or no access / villages chosen" })
  @ApiNotFoundResponse({ type: ErrorVo })
  save(@Param("userId") userId: string, @Body() body: AdminAccessDto, @CurrentUser() admin: UserRow): Promise<AdminAccessVo> {
    return this.service.save(userId, body, admin);
  }

  @Delete(":userId")
  @HttpCode(204)
  @ApiOperation({ summary: "Super admin: remove a member's admin access" })
  @ApiNoContentResponse()
  remove(@Param("userId") userId: string): Promise<void> {
    return this.service.remove(userId);
  }
}

@Module({ controllers: [AdminAccessController], providers: [AdminAccessService] })
export class AdminAccessModule {}
