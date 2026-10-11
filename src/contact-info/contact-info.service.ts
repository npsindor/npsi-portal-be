import { Injectable } from "@nestjs/common";
import { randomId } from "../common/utils/crypto.js";
import { PrismaService } from "../database/prisma.service.js";
import type { ContactInfoThanksVo, CreateContactInfoDto } from "./contact-info.dto.js";

@Injectable()
export class ContactInfoService {
  constructor(private readonly prisma: PrismaService) {}

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
