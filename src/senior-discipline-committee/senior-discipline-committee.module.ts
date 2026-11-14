import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsOptional } from "class-validator";
import { AdminGuard } from "../common/guards/auth.guards.js";
import { randomId } from "../common/utils/crypto.js";
import { OptionalBoolean, OptionalInt, OptionalText, RequiredText } from "../common/validation/fields.js";
import { PrismaService } from "../database/prisma.service.js";
import type { SeniorDisciplineCommitteeMember } from "../generated/prisma/client.js";

export class CommitteeMemberDto {
  @RequiredText("English name is required.", 255) nameEn!: string;
  @RequiredText("Hindi name is required.", 255) nameHi!: string;
  @OptionalText(2048) photoUrl?: string | null;
  @OptionalText(255) designationEn?: string | null;
  @OptionalText(255) designationHi?: string | null;
  @OptionalText() introductionEn?: string | null;
  @OptionalText() introductionHi?: string | null;
  @OptionalInt() displayOrder?: number | null;
  @OptionalBoolean() active?: boolean | null;
}

export class UpdateCommitteeMemberDto {
  @IsOptional() @OptionalText(255) nameEn?: string | null;
  @IsOptional() @OptionalText(255) nameHi?: string | null;
  @IsOptional() @OptionalText(2048) photoUrl?: string | null;
  @IsOptional() @OptionalText(255) designationEn?: string | null;
  @IsOptional() @OptionalText(255) designationHi?: string | null;
  @IsOptional() @OptionalText() introductionEn?: string | null;
  @IsOptional() @OptionalText() introductionHi?: string | null;
  @IsOptional() @OptionalInt() displayOrder?: number | null;
  @IsOptional() @OptionalBoolean() active?: boolean | null;
}

export class CommitteeMemberVo {
  id!: string;
  nameEn!: string;
  nameHi!: string;
  photoUrl!: string | null;
  designationEn!: string | null;
  designationHi!: string | null;
  introductionEn!: string | null;
  introductionHi!: string | null;
  displayOrder!: number;
  active!: boolean;
}
const toVo = (row: SeniorDisciplineCommitteeMember): CommitteeMemberVo => ({ ...row });

@Injectable()
export class SeniorDisciplineCommitteeService {
  constructor(private readonly prisma: PrismaService) {}

  async publicList(): Promise<CommitteeMemberVo[]> {
    return (await this.prisma.seniorDisciplineCommitteeMember.findMany({ where: { active: true }, orderBy: [{ displayOrder: "asc" }, { nameEn: "asc" }] })).map(
      toVo,
    );
  }

  async adminList(): Promise<CommitteeMemberVo[]> {
    return (await this.prisma.seniorDisciplineCommitteeMember.findMany({ orderBy: [{ displayOrder: "asc" }, { nameEn: "asc" }] })).map(toVo);
  }

  async create(dto: CommitteeMemberDto): Promise<CommitteeMemberVo> {
    return toVo(
      await this.prisma.seniorDisciplineCommitteeMember.create({
        data: {
          id: randomId(),
          nameEn: dto.nameEn.trim(),
          nameHi: dto.nameHi.trim(),
          photoUrl: dto.photoUrl || null,
          designationEn: dto.designationEn?.trim() || null,
          designationHi: dto.designationHi?.trim() || null,
          introductionEn: dto.introductionEn?.trim() || null,
          introductionHi: dto.introductionHi?.trim() || null,
          displayOrder: dto.displayOrder ?? 0,
          active: dto.active ?? true,
        },
      }),
    );
  }

  async update(id: string, dto: UpdateCommitteeMemberDto): Promise<CommitteeMemberVo> {
    return toVo(
      await this.prisma.seniorDisciplineCommitteeMember.update({
        where: { id },
        data: {
          nameEn: dto.nameEn?.trim(),
          nameHi: dto.nameHi?.trim(),
          photoUrl: dto.photoUrl === undefined ? undefined : dto.photoUrl || null,
          designationEn: dto.designationEn === undefined ? undefined : dto.designationEn?.trim() || null,
          designationHi: dto.designationHi === undefined ? undefined : dto.designationHi?.trim() || null,
          introductionEn: dto.introductionEn === undefined ? undefined : dto.introductionEn?.trim() || null,
          introductionHi: dto.introductionHi === undefined ? undefined : dto.introductionHi?.trim() || null,
          displayOrder: dto.displayOrder ?? undefined,
          active: dto.active ?? undefined,
        },
      }),
    );
  }

  async remove(id: string): Promise<void> {
    await this.prisma.seniorDisciplineCommitteeMember.deleteMany({ where: { id } });
  }
}

@ApiTags("senior-discipline-committee")
@Controller("senior-discipline-committee")
export class SeniorDisciplineCommitteeController {
  constructor(private readonly committee: SeniorDisciplineCommitteeService) {}

  @Get()
  @ApiOperation({ summary: "List active senior and discipline committee members" })
  @ApiOkResponse({ type: [CommitteeMemberVo] })
  list(): Promise<CommitteeMemberVo[]> {
    return this.committee.publicList();
  }

  @Get("all")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List all senior and discipline committee members — admin only" })
  @ApiOkResponse({ type: [CommitteeMemberVo] })
  listAll(): Promise<CommitteeMemberVo[]> {
    return this.committee.adminList();
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a senior and discipline committee member — admin only" })
  @ApiCreatedResponse({ type: CommitteeMemberVo })
  create(@Body() body: CommitteeMemberDto): Promise<CommitteeMemberVo> {
    return this.committee.create(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a senior and discipline committee member — admin only" })
  @ApiOkResponse({ type: CommitteeMemberVo })
  update(@Param("id") id: string, @Body() body: UpdateCommitteeMemberDto): Promise<CommitteeMemberVo> {
    return this.committee.update(id, body);
  }

  @Delete(":id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@Param("id") id: string): Promise<void> {
    await this.committee.remove(id);
  }
}

import { Module } from "@nestjs/common";
@Module({ controllers: [SeniorDisciplineCommitteeController], providers: [SeniorDisciplineCommitteeService] })
export class SeniorDisciplineCommitteeModule {}
