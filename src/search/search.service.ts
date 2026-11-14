import { Injectable } from "@nestjs/common";
import { communityAccount } from "../common/eligibility/community-account.js";
import type { UserRow } from "../common/session/session.service.js";
import { PrismaService } from "../database/prisma.service.js";

export interface SearchHit {
  id: string;
  title: string;
  titleHi?: string | null;
  subtitle?: string | null;
  link: string;
}
export interface SearchResults {
  query: string;
  groups: { key: string; items: SearchHit[] }[];
}

const LIMIT = 6;
const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : "");
const like = (q: string) => ({ contains: q });
// Family / member / student ids are matched exactly or by their trailing number ("12" → NPSI-FAM-000012).
const idLike = (q: string) => (/^\d{1,6}$/.test(q) ? { endsWith: q.padStart(6, "0") } : { contains: q.toUpperCase() });

// One search across the portal. Everyone sees only published public content (news, events, community posts, room
// hunting listings and requirements). A logged-in family member additionally finds people in their own family only;
// administrators find families, members and students. Nothing private (contacts, Aadhaar, payments, documents) is returned.
@Injectable()
export class SearchService {
  constructor(private readonly db: PrismaService) {}

  async search(rawQuery: string, user: UserRow | null): Promise<SearchResults> {
    const q = rawQuery.trim().replace(/\s+/g, " ").slice(0, 100);
    if (q.length < 2) return { query: q, groups: [] };
    const now = new Date();
    const [news, events, posts, listings, requirements] = await Promise.all([
      this.db.announcement.findMany({
        where: { status: "Active", OR: [{ title: like(q) }, { titleHi: like(q) }, { body: like(q) }, { bodyHi: like(q) }] },
        orderBy: { date: "desc" },
        take: LIMIT,
        select: { id: true, title: true, titleHi: true, date: true, type: true },
      }),
      this.db.event.findMany({
        where: { status: "PUBLISHED", OR: [{ title: like(q) }, { titleHi: like(q) }, { venue: like(q) }, { description: like(q) }] },
        orderBy: { date: "desc" },
        take: LIMIT,
        select: { id: true, title: true, titleHi: true, date: true, venue: true },
      }),
      this.db.communityPost.findMany({
        where: { active: true, OR: [{ title: like(q) }, { titleHi: like(q) }, { body: like(q) }, { location: like(q) }] },
        orderBy: { sortOrder: "asc" },
        take: LIMIT,
        select: { id: true, title: true, titleHi: true, section: true, location: true },
      }),
      this.db.rentalListing.findMany({
        where: {
          status: "APPROVED",
          expiresAt: { gt: now },
          OR: [{ propertyType: like(q) }, { area: like(q) }, { description: like(q) }, { reference: like(q) }],
        },
        orderBy: { approvedAt: "desc" },
        take: LIMIT,
        select: { id: true, propertyType: true, area: true, rentAmount: true },
      }),
      this.db.rentalRequirement.findMany({
        where: { status: "APPROVED", expiresAt: { gt: now }, OR: [{ propertyType: like(q) }, { area: like(q) }] },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
        select: { id: true, propertyType: true, area: true, maxBudget: true },
      }),
    ]);
    const groups: SearchResults["groups"] = [
      {
        key: "news",
        items: news.map((row) => ({ id: row.id, title: row.title, titleHi: row.titleHi, subtitle: day(row.date), link: `/news#news-${row.id}` })),
      },
      {
        key: "events",
        items: events.map((row) => ({
          id: row.id,
          title: row.title,
          titleHi: row.titleHi,
          subtitle: `${day(row.date)} · ${row.venue}`,
          link: `/events#event-${row.id}`,
        })),
      },
      {
        key: "community",
        items: posts.map((row) => ({
          id: row.id,
          title: row.title,
          titleHi: row.titleHi,
          subtitle: row.location,
          link: row.section === "career" ? "/career-business" : "/community-services",
        })),
      },
      {
        key: "rentals",
        items: listings.map((row) => ({
          id: row.id,
          title: `${row.propertyType} · ${row.area}`,
          subtitle: `₹${row.rentAmount.toLocaleString("en-IN")} / month`,
          link: `/room-hunting?q=${encodeURIComponent(row.area)}`,
        })),
      },
      {
        key: "roomRequirements",
        items: requirements.map((row) => ({
          id: row.id,
          title: `${row.propertyType} · ${row.area}`,
          subtitle: `≤ ₹${row.maxBudget.toLocaleString("en-IN")} / month`,
          link: `/room-hunting?tab=requirements&q=${encodeURIComponent(row.area)}`,
        })),
      },
    ];
    if (user?.role === "admin") groups.push(...(await this.adminGroups(q)));
    else if (user) groups.push(...(await this.ownFamily(q, user)));
    return { query: q, groups: groups.filter((group) => group.items.length) };
  }

  // A member finds people in their own family only (never another family's data).
  private async ownFamily(q: string, user: UserRow): Promise<SearchResults["groups"]> {
    const account = await communityAccount(this.db, user);
    if (!account?.familyId) return [];
    const members = await this.db.familyMember.findMany({
      where: { familyId: account.familyId, OR: [{ name: like(q) }, { membershipId: idLike(q) }, { relationship: like(q) }] },
      take: LIMIT,
      select: { id: true, name: true, relationship: true, membershipId: true },
    });
    return [
      {
        key: "myFamily",
        items: members.map((row) => ({
          id: row.id,
          title: row.name,
          subtitle: [row.relationship, row.membershipId].filter(Boolean).join(" · "),
          link: "/portal/family",
        })),
      },
    ];
  }

  private async adminGroups(q: string): Promise<SearchResults["groups"]> {
    const [families, members, students] = await Promise.all([
      this.db.family.findMany({
        where: {
          OR: [
            { familyId: idLike(q) },
            { familyName: like(q) },
            { headName: like(q) },
            { village: like(q) },
            { nativePlace: like(q) },
            { city: like(q) },
            { address: like(q) },
          ],
        },
        take: LIMIT,
        select: { id: true, familyId: true, headName: true, familyName: true, village: true, status: true },
      }),
      this.db.familyMember.findMany({
        where: { OR: [{ name: like(q) }, { membershipId: idLike(q) }, { familyId: idLike(q) }] },
        take: LIMIT,
        select: { id: true, name: true, familyId: true, membershipId: true },
      }),
      this.db.student.findMany({
        where: { OR: [{ studentName: like(q) }, { studentId: idLike(q) }, { institution: like(q) }, { city: like(q) }] },
        take: LIMIT,
        select: { id: true, studentName: true, studentId: true, institution: true, status: true },
      }),
    ]);
    return [
      {
        key: "families",
        items: families.map((row) => ({
          id: row.id,
          title: `${row.headName || row.familyName || ""} (${row.familyId || ""})`,
          subtitle: [row.village, row.status].filter(Boolean).join(" · "),
          link: `/admin/families?q=${encodeURIComponent(row.familyId || "")}`,
        })),
      },
      {
        key: "members",
        items: members.map((row) => ({
          id: row.id,
          title: row.name,
          subtitle: [row.membershipId, row.familyId].filter(Boolean).join(" · "),
          link: `/admin/families?q=${encodeURIComponent(row.familyId)}`,
        })),
      },
      {
        key: "students",
        items: students.map((row) => ({
          id: row.id,
          title: `${row.studentName}${row.studentId ? ` (${row.studentId})` : ""}`,
          subtitle: [row.institution, row.status].filter(Boolean).join(" · "),
          link: `/admin/students?q=${encodeURIComponent(row.studentId || row.studentName)}`,
        })),
      },
    ];
  }
}
