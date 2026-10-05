import { Injectable } from "@nestjs/common";
import type { UserRow } from "../common/session/session.service.js";
import type { DbRow } from "../database/database.types.js";
import { type EntityVo, toEntityVo } from "../entities/vo/entity.vo.js";
import { MeRepository } from "./me.repository.js";
import type { MyFamilyVo } from "./vo/me.vo.js";

// Narrow, purpose-built reads for the logged-in member, so the UI never has to
// fetch whole sensitive tables and filter them client-side.
@Injectable()
export class MeService {
  constructor(private readonly repo: MeRepository) {}

  async family(user: UserRow): Promise<MyFamilyVo> {
    let family: DbRow | null = null;
    if (user.email) {
      family = (await this.repo.activeFamilyByEmail(user.email)) || null;
      if (!family) {
        const member = await this.repo.memberFamilyIdByEmail(user.email);
        if (member) family = (await this.repo.familyByFamilyId(member.family_id)) || null;
      }
    }
    const members = family ? await this.repo.membersOfFamily(family.family_id) : [];
    const student = user.email ? (await this.repo.studentByEmail(user.email)) || null : null;
    return { family: family ? toEntityVo(family) : null, members: members.map(toEntityVo), student: student ? toEntityVo(student) : null };
  }

  async feedback(user: UserRow): Promise<EntityVo[]> {
    const list = user.email ? await this.repo.feedbackByEmail(user.email) : [];
    return list.map(toEntityVo);
  }
}
