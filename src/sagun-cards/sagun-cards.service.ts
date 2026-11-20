import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { AppConfigService } from "../config/app-config.service.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import { indiaToday } from "../safar-saathi/safar.rules.js";
import { DEFAULT_SETTINGS } from "../sagun/sagun.eligibility.js";
import { sagunFields } from "../sagun/sagun.fields.js";
import { sagunPrivateRoot } from "../sagun/sagun.service.js";
import { planBooklet } from "./sagun-booklet.plan.js";
import { renderBooklet, renderCard } from "./sagun-card.pdf.js";
import { backfillDigitalCards } from "./sagun-card.records.js";
import { buildCardView, type CardView } from "./sagun-card.view.js";
import type { SagunBookletDto, SagunCardListDto, SagunCardSelectionDto } from "./sagun-cards.dto.js";

const DEFAULT_TITLE = "शगुन बंधन – वैवाहिक परिचय पुस्तिका";
const collator = new Intl.Collator("hi", { sensitivity: "base" });

// Photos are re-encoded for print: upright (EXIF), cropped to the 3:4 frame and capped at 600 px high, which keeps a
// 200-profile booklet a few MB instead of hundreds. sharp is loaded lazily; without it JPEG/PNG are used as stored.
type Sharp = typeof import("sharp").default;
let sharpModule: Promise<Sharp | null> | null = null;
const loadSharp = () => {
  sharpModule ??= import("sharp").then((module) => (module.default ?? module) as unknown as Sharp).catch(() => null);
  return sharpModule;
};

@Injectable()
export class SagunCardsService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private admin(user: UserRow) {
    if (user.role !== "admin") throw new ApiError(403, "SAGUN_ADMIN_REQUIRED");
  }
  private audit(db: Db, user: UserRow, action: string, entityId: string) {
    return db.sagunAudit.create({ data: { id: randomId(), actorId: user.id, action, entityId } });
  }
  private async membersVisibility() {
    const row = await this.db.sagunSettings.findUnique({ where: { id: "default" }, select: { profileVisibility: true } });
    return (row?.profileVisibility ?? DEFAULT_SETTINGS.profileVisibility) === "MEMBERS";
  }
  private async views(where: { id?: { in: string[] } } = {}): Promise<CardView[]> {
    const [rows, visible] = await Promise.all([
      this.db.sagunProfile.findMany({
        where: { ...where, digitalCard: { isNot: null } },
        include: { digitalCard: true, files: { select: { id: true, kind: true } }, user: { select: { status: true } } },
        take: 5000,
      }),
      this.membersVisibility(),
    ]);
    const today = indiaToday();
    return rows.map((row) => buildCardView(row as Parameters<typeof buildCardView>[0], sagunFields, this.config.frontendUrl, visible, today));
  }
  private sorted(cards: CardView[], sort: "name" | "date" = "name") {
    return [...cards].sort((a, b) =>
      sort === "date"
        ? (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "") || a.profileCode.localeCompare(b.profileCode)
        : collator.compare(a.name, b.name) || a.profileCode.localeCompare(b.profileCode),
    );
  }

  async stats(user: UserRow) {
    this.admin(user);
    await backfillDigitalCards(this.db);
    const cards = await this.views();
    const count = (test: (card: CardView) => boolean) => cards.filter(test).length;
    return {
      total: cards.length,
      grooms: count((card) => card.category === "GROOM"),
      brides: count((card) => card.category === "BRIDE"),
      pending: count((card) => card.state === "PENDING"),
      approved: count((card) => card.state === "APPROVED"),
      rejected: count((card) => card.state === "REJECTED"),
      inactive: count((card) => card.state === "INACTIVE"),
      eligible: count((card) => card.bookletEligible),
      selected: count((card) => card.selected),
      published: count((card) => Boolean(card.lastPublishedAt)),
      booklets: await this.db.sagunBookletHistory.count(),
    };
  }

  async list(query: SagunCardListDto, user: UserRow) {
    this.admin(user);
    await backfillDigitalCards(this.db);
    const q = query.q?.toLocaleLowerCase("hi");
    const place = query.place?.toLocaleLowerCase("hi");
    const cards = (await this.views()).filter(
      (card) =>
        (!query.state || card.state === query.state) &&
        (!query.category || card.category === query.category) &&
        (query.selected === undefined || card.selected === query.selected) &&
        (query.eligible === undefined || card.bookletEligible === query.eligible) &&
        (!q || card.name.toLocaleLowerCase("hi").includes(q) || card.profileCode.toLowerCase().includes(q)) &&
        (!place || card.place.toLocaleLowerCase("hi").includes(place)),
    );
    return this.sorted(cards, query.sort ?? "date")
      .reverse()
      .map(({ verifyUrl: _verifyUrl, ...card }) => card);
  }

  // Selecting is only allowed for cards that may be printed; deselecting always works.
  async select(input: SagunCardSelectionDto, user: UserRow) {
    this.admin(user);
    const ids = [...new Set(input.profileIds)];
    const cards = await this.views({ id: { in: ids } });
    if (cards.length !== ids.length) throw new ApiError(404, "SAGUN_NOT_FOUND");
    if (input.selected && cards.some((card) => !card.bookletEligible)) throw new ApiError(409, "SAGUN_CARD_NOT_ELIGIBLE");
    await this.db.$transaction(async (tx) => {
      await tx.sagunDigitalCard.updateMany({ where: { profileId: { in: ids } }, data: { selectedForBooklet: input.selected } });
      for (const id of ids) await this.audit(tx, user, input.selected ? "CARD_SELECTED" : "CARD_DESELECTED", id);
    });
    return { updated: ids.length };
  }

  private async photo(card: CardView): Promise<Buffer | null> {
    if (!card.photoFileId) return null;
    const file = await this.db.sagunFile.findUnique({ where: { id: card.photoFileId } });
    if (!file) return null;
    let buffer: Buffer;
    try {
      buffer = await readFile(path.join(sagunPrivateRoot(this.config.uploadsDir), file.filename));
    } catch {
      return null;
    }
    const sharp = await loadSharp();
    if (sharp) {
      try {
        return await sharp(buffer).rotate().resize(450, 600, { fit: "cover", position: "attention" }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
      } catch {
        return null;
      }
    }
    return /^image\/(jpeg|png)$/.test(file.mime) ? buffer : null;
  }
  private async photos(cards: CardView[]) {
    const map = new Map<string, Buffer | null>();
    for (const card of cards) map.set(card.profileId, await this.photo(card));
    return map;
  }

  // One card as a PDF page of the card's own size (preview and "print card").
  async cardPdf(profileId: string, user: UserRow) {
    this.admin(user);
    await backfillDigitalCards(this.db);
    const [card] = await this.views({ id: { in: [profileId] } });
    if (!card) throw new ApiError(404, "SAGUN_NOT_FOUND");
    await this.audit(this.db, user, "CARD_GENERATED", profileId);
    return { pdf: await renderCard(card, await this.photo(card)), filename: `${card.profileCode}.pdf` };
  }

  private async bookletCards(input: SagunBookletDto) {
    const ids = [...new Set(input.profileIds)];
    const cards = await this.views({ id: { in: ids } });
    if (cards.length !== ids.length) throw new ApiError(404, "SAGUN_NOT_FOUND");
    if (cards.some((card) => !card.bookletEligible)) throw new ApiError(409, "SAGUN_CARD_NOT_ELIGIBLE");
    return this.sorted(cards, input.sort ?? "name");
  }
  private bookletOptions(input: SagunBookletDto) {
    return {
      layout: input.layout,
      grouping: input.grouping,
      includeCover: input.includeCover,
      includeIndex: input.includeIndex,
      includeClosing: input.includeClosing,
    };
  }
  private meta(input: SagunBookletDto) {
    return { title: input.title || DEFAULT_TITLE, edition: input.edition || "", year: Number(indiaToday().slice(0, 4)), contactLine: input.contactLine || "" };
  }

  // Preview: the exact PDF the booklet would be, without saving it or adding it to the print history.
  async bookletPreview(input: SagunBookletDto, user: UserRow) {
    this.admin(user);
    const cards = await this.bookletCards(input);
    const { pdf, totalPages } = await renderBooklet(cards, await this.photos(cards), this.bookletOptions(input), this.meta(input));
    return { pdf, totalPages };
  }

  // Generates the booklet, stores the PDF in private storage and records it in the print history.
  async generateBooklet(input: SagunBookletDto, user: UserRow) {
    this.admin(user);
    const cards = await this.bookletCards(input);
    const options = this.bookletOptions(input);
    const meta = this.meta(input);
    const { pdf, totalPages } = await renderBooklet(cards, await this.photos(cards), options, meta);
    const id = randomId();
    const dir = path.join(sagunPrivateRoot(this.config.uploadsDir), "booklets");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const filename = `booklet-${id}.pdf`;
    await writeFile(path.join(dir, filename), pdf, { mode: 0o600, flag: "wx" });
    const now = new Date();
    const row = await this.db.$transaction(async (tx) => {
      const history = await tx.sagunBookletHistory.create({
        data: {
          id,
          title: meta.title,
          edition: meta.edition,
          profileIds: cards.map((card) => card.profileId),
          cardLayout: options.layout,
          grouping: options.grouping,
          includeCover: options.includeCover,
          includeIndex: options.includeIndex,
          totalProfiles: cards.length,
          totalPages,
          pdfFilename: filename,
          pdfSize: pdf.length,
          generatedBy: user.id,
          generatedByName: (user.fullName || user.email || "").slice(0, 150),
          generatedAt: now,
        },
      });
      await tx.sagunDigitalCard.updateMany({ where: { profileId: { in: cards.map((card) => card.profileId) } }, data: { lastPublishedAt: now } });
      await this.audit(tx, user, "BOOKLET_GENERATED", id);
      return history;
    });
    return this.historyVo(row);
  }

  private historyVo(row: Awaited<ReturnType<PrismaService["sagunBookletHistory"]["findFirst"]>> & object) {
    const { pdfFilename, profileIds, ...rest } = row;
    return { ...rest, profileIds: Array.isArray(profileIds) ? profileIds : [], hasPdf: Boolean(pdfFilename), generatedAt: row.generatedAt.toISOString() };
  }
  async history(user: UserRow) {
    this.admin(user);
    const rows = await this.db.sagunBookletHistory.findMany({ orderBy: [{ generatedAt: "desc" }, { id: "asc" }], take: 200 });
    return rows.map((row) => this.historyVo(row));
  }
  async historyPdf(id: string, user: UserRow) {
    this.admin(user);
    const row = await this.db.sagunBookletHistory.findUnique({ where: { id } });
    if (!row?.pdfFilename) throw new ApiError(404, "SAGUN_NOT_FOUND");
    try {
      const pdf = await readFile(path.join(sagunPrivateRoot(this.config.uploadsDir), "booklets", row.pdfFilename));
      await this.audit(this.db, user, "BOOKLET_DOWNLOADED", id);
      return { pdf, filename: `sagun-booklet-${row.generatedAt.toISOString().slice(0, 10)}.pdf` };
    } catch {
      throw new ApiError(404, "SAGUN_NOT_FOUND");
    }
  }

  // Public QR check: confirms a printed card is genuine and still active. Shows only what is printed on the card
  // front anyway (name, category, profile ID) and never contact, family or document details.
  async verify(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new ApiError(404, "SAGUN_CARD_NOT_FOUND");
    const card = await this.db.sagunDigitalCard.findUnique({
      where: { verifyToken: token },
      select: { profileId: true, profileCode: true, verifyToken: true },
    });
    // The column compares case-insensitively; the token itself is case-sensitive, so the exact value must match.
    if (!card || card.verifyToken !== token) throw new ApiError(404, "SAGUN_CARD_NOT_FOUND");
    const [view] = await this.views({ id: { in: [card.profileId] } });
    const active = Boolean(view?.bookletEligible);
    return {
      valid: active,
      profileCode: card.profileCode,
      ...(active && view ? { name: view.name, category: view.category, categoryLabel: view.categoryLabel, place: view.place } : {}),
      issuedBy: "निमाड़ पाटीदार संगठन, इंदौर",
    };
  }

  // Pages a booklet would have, for the confirmation before generating.
  async bookletPlan(input: SagunBookletDto, user: UserRow) {
    this.admin(user);
    const cards = await this.bookletCards(input);
    return { totalProfiles: cards.length, totalPages: planBooklet(cards, this.bookletOptions(input)).length };
  }
}
