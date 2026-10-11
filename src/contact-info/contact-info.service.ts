import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, type ListQueryDto } from "../common/dto/list-query.dto.js";
import { randomId } from "../common/utils/crypto.js";
import { PrismaService } from "../database/prisma.service.js";
import type { ContactInfoPageVo, ContactInfoThanksVo, CreateContactInfoDto } from "./contact-info.dto.js";

@Injectable()
export class ContactInfoService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQueryDto): Promise<ContactInfoPageVo> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.contactInfo.findMany({
          take: limit,
          skip: offset,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, fullName: true, contactNumber: true, email: true, indoreArea: true, nativeVillage: true, isStudent: true, createdAt: true },
        }),
        this.prisma.contactInfo.count(),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })), total, limit, offset };
  }

  async create(dto: CreateContactInfoDto): Promise<ContactInfoThanksVo> {
    await this.prisma.contactInfo.create({
      data: {
        id: randomId(),
        fullName: dto.fullName,
        contactNumber: dto.contactNumber,
        email: dto.email ?? null,
        indoreArea: dto.indoreArea,
        nativeVillage: dto.nativeVillage,
        isStudent: dto.isStudent,
      },
      select: { id: true },
    });
    return {
      success: true,
      message: dto.lang === "hi" ? "धन्यवाद! आपकी जानकारी सहेज ली गई है।" : "Thank you! Your details have been saved.",
    };
  }
}
