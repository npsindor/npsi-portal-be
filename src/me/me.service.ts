import { Injectable } from "@nestjs/common";
import type { UserRow } from "../common/session/session.service.js";
import { toFamilyVo } from "../families/vo/families.vo.js";
import { toFamilyMemberVo } from "../family-members/vo/family-members.vo.js";
import { type FeedbackVo, toFeedbackVo } from "../feedback/vo/feedback.vo.js";
import { toStudentVo } from "../students/vo/students.vo.js";
import { MeRepository } from "./me.repository.js";
import type { MyFamilyVo } from "./vo/me.vo.js";

// Narrow, purpose-built reads for the logged-in member, so the UI never has to
// fetch whole sensitive tables and filter them client-side.
@Injectable()
export class MeService {
  constructor(private readonly repo: MeRepository) {}

  async family(user: UserRow): Promise<MyFamilyVo> {
    if (!user.email) return { family: null, members: [], student: null };
    let family = await this.repo.activeFamilyByEmail(user.email);
    if (!family) {
      const familyId = await this.repo.memberFamilyIdByEmail(user.email);
      if (familyId) family = await this.repo.familyByFamilyId(familyId);
    }
    const members = family?.familyId ? await this.repo.membersOfFamily(family.familyId) : [];
    const student = await this.repo.studentByEmail(user.email);
    return { family: family ? toFamilyVo(family) : null, members: members.map(toFamilyMemberVo), student: student ? toStudentVo(student) : null };
  }

  async feedback(user: UserRow): Promise<FeedbackVo[]> {
    return user.email ? (await this.repo.feedbackByEmail(user.email)).map(toFeedbackVo) : [];
  }
}
