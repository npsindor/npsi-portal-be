import { Injectable } from "@nestjs/common";
import { indiaDate } from "../common/validation/fields.js";
import { PrismaService } from "../database/prisma.service.js";
import { ageOn, byName, isBirthdayOn, isHead, MIN_BIRTHDAY_AGE } from "./home-members.rules.js";

const ACTIVE = ["ACTIVE", "Active", "APPROVED"];
// Names typed with extra spaces ("Arvind   Patidar") are shown tidy.
const tidy = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
const tidyOrNull = (value: string | null | undefined) => tidy(value) || null;
const MAX_HEADS = 200;

@Injectable()
export class HomeMembersService {
  constructor(private readonly db: PrismaService) {}

  // The photo of a family's owner account, for heads without a member photo.
  private async ownerPhotos(ownerIds: (string | null)[]): Promise<Map<string, string>> {
    const ids = [...new Set(ownerIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) return new Map();
    const users = await this.db.user.findMany({ where: { id: { in: ids }, photoUrl: { not: null } }, select: { id: true, photoUrl: true } });
    return new Map(users.filter((u) => u.photoUrl).map((u) => [u.id, u.photoUrl as string]));
  }

  // "NPS Family Heads": the heads of the families shown on the home page, in alphabetical order of the head's name.
  // (The first MAX_HEADS families by registration are taken, so the list stays bounded; then sorted by name.)
  async familyHeads() {
    const families = await this.db.family.findMany({
      where: { status: "ACTIVE", showOnHome: true },
      orderBy: [{ registrationDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: MAX_HEADS,
      select: {
        id: true,
        headName: true,
        village: true,
        nativePlace: true,
        ownerUserId: true,
        members: { select: { name: true, relationship: true, photoUrl: true } },
      },
    });
    const photos = await this.ownerPhotos(families.map((family) => family.ownerUserId));
    return families
      .map((family) => {
        const head = family.members.find((member) => isHead(member.relationship));
        return {
          id: family.id,
          name: tidy(head?.name || family.headName),
          place: tidyOrNull(family.village || family.nativePlace),
          photoUrl: head?.photoUrl || (family.ownerUserId ? photos.get(family.ownerUserId) : null) || null,
        };
      })
      .filter((head) => head.name)
      .sort(byName);
  }

  // "Today Birthday": adult ACTIVE members of the chosen families whose birthday is today (India time).
  async birthdaysToday(today = indiaDate()) {
    const members = await this.db.familyMember.findMany({
      where: { dob: { not: null }, status: { in: ACTIVE }, family: { status: "ACTIVE", showOnHome: true } },
      select: {
        id: true,
        name: true,
        dob: true,
        relationship: true,
        photoUrl: true,
        family: { select: { village: true, nativePlace: true, ownerUserId: true } },
      },
      take: 5000,
    });
    const todays = members.filter((member) => member.dob && isBirthdayOn(member.dob, today) && ageOn(member.dob, today) >= MIN_BIRTHDAY_AGE);
    const photos = await this.ownerPhotos(todays.filter((member) => isHead(member.relationship)).map((member) => member.family.ownerUserId));
    return todays
      .map((member) => ({
        id: member.id,
        name: tidy(member.name),
        place: tidyOrNull(member.family.village || member.family.nativePlace),
        photoUrl: member.photoUrl || (isHead(member.relationship) && member.family.ownerUserId ? photos.get(member.family.ownerUserId) : null) || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
