import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { type BookletOptions, type PlannedPage, planBooklet, SECTION_TITLES, type SectionKey } from "./sagun-booklet.plan.js";
import type { CardRow, CardView } from "./sagun-card.view.js";

// Server-side PDF for Sagun Bandhan digital cards and the A4 booklet (pdfkit: vector text with embedded, subset fonts;
// Devanagari is shaped by fontkit). Cards are drawn once in a 600 × 400 design space and scaled to each layout.

type Doc = PDFKit.PDFDocument;
type Image = unknown;
const C = {
  maroon: "#7a1022",
  maroonDark: "#560a17",
  gold: "#c9962b",
  goldLight: "#efd08a",
  cream: "#fff8e8",
  page: "#fffdf7",
  ink: "#2b1a12",
  muted: "#6b4a3a",
  line: "#ead6aa",
  green: "#2f7d32",
};
export const CARD_W = 600;
export const CARD_H = 400;
const A4: [number, number] = [595.28, 841.89];
const CONTENT = { x: 36, y: 72, w: 523.28, h: 722 };

export interface BookletMeta {
  title: string;
  edition: string;
  year: number;
  contactLine: string;
}

// ---------- assets ----------
let assetRoot: string | null = null;
const assets = () => {
  if (assetRoot) return assetRoot;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    for (const candidate of [path.join(dir, "assets", "sagun-cards"), path.join(dir, "src", "assets", "sagun-cards")])
      if (existsSync(path.join(candidate, "fonts", "NotoSans-Regular.ttf"))) {
        assetRoot = candidate;
        return candidate;
      }
    dir = path.dirname(dir);
  }
  throw new Error("SAGUN_CARD_ASSETS_MISSING");
};
const fontCache = new Map<string, Buffer>();
const asset = (name: string) => {
  const file = path.join(assets(), name);
  if (!fontCache.has(file)) fontCache.set(file, readFileSync(file));
  return fontCache.get(file) as Buffer;
};

// ---------- mixed Hindi / English text ----------
type Weight = 400 | 600 | 700;
const FONT_FILES: Record<string, string> = {
  "dev-400": "fonts/NotoSansDevanagari-Regular.ttf",
  "dev-600": "fonts/NotoSansDevanagari-SemiBold.ttf",
  "dev-700": "fonts/NotoSansDevanagari-Bold.ttf",
  "lat-400": "fonts/NotoSans-Regular.ttf",
  "lat-600": "fonts/NotoSans-SemiBold.ttf",
  "lat-700": "fonts/NotoSans-Bold.ttf",
};
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿‌‍]/;
// Characters both fonts carry: they stay in whichever font the surrounding text uses.
const NEUTRAL = /[\s0-9.,:;()/\-–—'"%+!?&]/;
interface Run {
  dev: boolean;
  text: string;
}
export const splitRuns = (value: string): Run[] => {
  const runs: Run[] = [];
  let pending = "";
  for (const char of Array.from(value)) {
    if (NEUTRAL.test(char)) {
      if (runs.length) runs[runs.length - 1].text += char;
      else pending += char;
      continue;
    }
    const dev = DEVANAGARI.test(char);
    if (runs.length && runs[runs.length - 1].dev === dev) runs[runs.length - 1].text += char;
    else {
      runs.push({ dev, text: pending + char });
      pending = "";
    }
  }
  if (pending) runs.push({ dev: false, text: pending });
  return runs;
};

interface TextOptions {
  size: number;
  weight?: Weight;
  color?: string;
  width?: number;
  align?: "left" | "center" | "right";
  minSize?: number;
}
class Typo {
  constructor(private readonly doc: Doc) {
    for (const [name, file] of Object.entries(FONT_FILES)) doc.registerFont(name, asset(file));
  }
  private font(run: Run, weight: Weight, size: number) {
    return this.doc.font(`${run.dev ? "dev" : "lat"}-${weight}`).fontSize(size);
  }
  width(value: string, size: number, weight: Weight = 400) {
    return splitRuns(value).reduce((total, run) => total + this.font(run, weight, size).widthOfString(run.text), 0);
  }
  // Fits one line: shrinks down to minSize, then shortens with an ellipsis.
  fit(value: string, options: TextOptions) {
    const weight = options.weight ?? 400;
    let size = options.size;
    let content = value;
    if (options.width) {
      while (options.minSize && size > options.minSize && this.width(content, size, weight) > options.width) size = Math.max(options.minSize, size - 0.25);
      const chars = Array.from(content);
      while (chars.length > 1 && this.width(content, size, weight) > options.width) {
        chars.pop();
        content = `${chars.join("").trimEnd()}…`;
      }
    }
    return { content, size };
  }
  // y is the baseline.
  line(value: string, x: number, y: number, options: TextOptions) {
    if (!value) return;
    const weight = options.weight ?? 400;
    const { content, size } = this.fit(value, options);
    const width = this.width(content, size, weight);
    let cursor =
      options.align === "center" && options.width
        ? x + (options.width - width) / 2
        : options.align === "right" && options.width
          ? x + options.width - width
          : x;
    this.doc.fillColor(options.color ?? C.ink);
    for (const run of splitRuns(content)) {
      this.font(run, weight, size).text(run.text, cursor, y, { lineBreak: false, baseline: "alphabetic" });
      cursor += this.doc.widthOfString(run.text);
    }
  }
  // Word-wrapped paragraph; returns the baseline after the last line.
  paragraph(value: string, x: number, y: number, options: TextOptions & { width: number; lineHeight: number }) {
    const words = value.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (current && this.width(next, options.size, options.weight) > options.width) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    lines.forEach((text, index) => {
      this.line(text, x, y + index * options.lineHeight, options);
    });
    return y + lines.length * options.lineHeight;
  }
}

// ---------- ornaments ----------
function kalash(doc: Doc, x: number, y: number, s: number) {
  doc.save().translate(x, y).scale(s).translate(0, 12);
  const leaf = (angle: number) => {
    doc.save().translate(50, 30).rotate(angle).path("M0 0 C9 -10 9 -26 0 -40 C-9 -26 -9 -10 0 0 Z").fill(C.green).restore();
  };
  [-55, -28, 0, 28, 55].forEach(leaf);
  doc.ellipse(50, 18, 13, 16).fill("#8b5a2b");
  doc.path("M43 6 Q50 -4 57 6").lineWidth(2.5).strokeColor("#5b3a1a").stroke();
  const gold = doc.linearGradient(18, 0, 82, 0).stop(0, "#a8741a").stop(0.45, "#f3cf6b").stop(1, "#a8741a");
  doc.roundedRect(30, 30, 40, 8, 3).fill(gold);
  doc.path("M36 38 H64 L68 48 H32 Z").fill(gold);
  doc.path("M33 48 C6 58 8 100 34 108 H66 C92 100 94 58 67 48 Z").fill(gold);
  doc.path("M22 62 Q50 72 78 62").lineWidth(3).strokeColor("#b91c1c").stroke();
  // swastik, as on the reference card
  doc.save().translate(50, 84).lineWidth(2.6).strokeColor("#b91c1c");
  doc.path("M0 -10 V10 M-10 0 H10 M0 -10 H8 M10 0 V8 M0 10 H-8 M-10 0 V-8").stroke();
  doc.restore();
  doc.ellipse(50, 110, 26, 4).fill("#8a5a12");
  doc.restore();
}
function cornerFlourish(doc: Doc, x: number, y: number, sx: number, sy: number, scale = 1) {
  doc
    .save()
    .translate(x, y)
    .scale(sx * scale, sy * scale)
    .lineWidth(1.3)
    .strokeColor(C.gold);
  doc.path("M0 30 C0 12 12 0 30 0").stroke();
  doc.path("M6 30 C6 16 16 6 30 6").lineWidth(0.6).stroke();
  doc.path("M30 0 C38 0 42 6 38 10 C35 13 31 10 33 7").lineWidth(1.1).stroke();
  doc.path("M0 30 C0 38 6 42 10 38 C13 35 10 31 7 33").stroke();
  doc.circle(14, 14, 2.2).fill(C.gold);
  doc.restore();
}
type IconKey = CardRow["key"];
function icon(doc: Doc, key: IconKey, x: number, y: number, size: number) {
  const s = size / 16;
  doc.save().translate(x, y).scale(s).fillColor(C.maroon).strokeColor(C.maroon);
  switch (key) {
    case "name":
    case "father":
      doc.circle(8, 4.5, 3.6).fill();
      doc.path("M1.5 15 C1.5 9.5 4.5 8.5 8 8.5 C11.5 8.5 14.5 9.5 14.5 15 Z").fill();
      break;
    case "mobile":
      doc
        .path(
          "M3.2 1.5 L6 1 L7.6 5 L5.6 6.4 C6.6 8.6 8 10 10 11 L11.4 9 L15 10.6 L14.6 13.6 C14.4 14.6 13.4 15.2 12.4 15 C6.4 13.8 2.6 10 1.4 4 C1.2 2.8 2 1.8 3.2 1.5 Z",
        )
        .fill();
      break;
    case "birth":
      doc.roundedRect(1.5, 3, 13, 11.5, 1.6).lineWidth(1.6).stroke();
      doc.rect(1.5, 3, 13, 3.6).fill();
      doc.rect(4.2, 1, 1.6, 3.4).fill();
      doc.rect(10.2, 1, 1.6, 3.4).fill();
      break;
    case "height":
      doc.path("M8 1 L12 5 H9.3 V11 H12 L8 15 L4 11 H6.7 V5 H4 Z").fill();
      break;
    case "education":
      doc.path("M0.5 6 L8 2.5 L15.5 6 L8 9.5 Z").fill();
      doc.path("M4 8 V11.5 C6 13.5 10 13.5 12 11.5 V8 L8 10 Z").fill();
      break;
    case "occupation":
      doc.roundedRect(1, 5, 14, 9.5, 1.5).fill();
      doc.path("M5.5 5 V3 H10.5 V5").lineWidth(1.6).stroke();
      break;
    case "place":
      doc.path("M8 1.5 L15 8 H13 V14.5 H9.6 V10.5 H6.4 V14.5 H3 V8 H1 Z").fill();
      break;
  }
  doc.restore();
}
function qr(doc: Doc, text: string, x: number, y: number, size: number) {
  const code = QRCode.create(text, { errorCorrectionLevel: "M" });
  const count = code.modules.size;
  const quiet = 2;
  const cell = size / (count + quiet * 2);
  doc.rect(x, y, size, size).fill("#ffffff");
  doc.fillColor("#000000");
  for (let row = 0; row < count; row += 1) {
    let start = -1;
    for (let col = 0; col <= count; col += 1) {
      const dark = col < count && code.modules.get(row, col);
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        doc.rect(x + (quiet + start) * cell, y + (quiet + row) * cell, (col - start) * cell + 0.05, cell + 0.05);
        start = -1;
      }
    }
  }
  doc.fill();
}

// ---------- one card, in design units ----------
function drawCard(doc: Doc, t: Typo, card: CardView, logo: Image, photo: Image | null) {
  // paper
  doc.save().roundedRect(0, 0, CARD_W, CARD_H, 16).clip();
  doc.rect(0, 0, CARD_W, CARD_H).fill(doc.radialGradient(300, 230, 40, 300, 230, 420).stop(0, "#fffcf2").stop(1, "#f8ead0"));
  // header band
  const band = doc.linearGradient(0, 0, CARD_W, 0).stop(0, C.maroonDark).stop(0.5, C.maroon).stop(1, C.maroonDark);
  doc.path(`M0 0 H${CARD_W} V86 Q300 116 0 86 Z`).fill(band);
  doc.path(`M0 86 Q300 116 ${CARD_W} 86`).lineWidth(2.5).strokeColor(C.gold).stroke();
  // footer band
  doc.rect(0, 364, CARD_W, 36).fill(band);
  doc.moveTo(0, 364).lineTo(CARD_W, 364).lineWidth(2).strokeColor(C.gold).stroke();
  doc.restore();
  doc
    .roundedRect(1.5, 1.5, CARD_W - 3, CARD_H - 3, 15)
    .lineWidth(3)
    .strokeColor(C.gold)
    .stroke();
  doc
    .roundedRect(6, 6, CARD_W - 12, CARD_H - 12, 12)
    .lineWidth(0.7)
    .strokeColor(C.goldLight)
    .stroke();

  doc.image(logo as never, 14, 6, { height: 82 });
  kalash(doc, 520, 13, 0.62);
  t.line("निमाड़ पाटीदार संगठन, इंदौर", 116, 40, { size: 25, weight: 700, color: "#ffffff", width: 390, align: "center", minSize: 18 });
  t.line("NIMAD PATIDAR SANGATHAN, INDORE", 116, 55, { size: 8.5, weight: 600, color: C.goldLight, width: 390, align: "center" });
  t.line("॥ समाज सेवा • संस्कार • समर्पण ॥", 116, 74, { size: 12.5, weight: 600, color: C.goldLight, width: 390, align: "center" });

  // title ribbon
  doc.save();
  doc.polygon([155, 116], [146, 108], [155, 100]).fill(C.gold);
  doc.polygon([445, 116], [454, 108], [445, 100]).fill(C.gold);
  doc.roundedRect(158, 96, 284, 36, 16).fill(C.maroon);
  doc.roundedRect(158, 96, 284, 36, 16).lineWidth(1.6).strokeColor(C.gold).stroke();
  doc.restore();
  t.line("शगुन बंधन – डिजिटल कार्ड", 158, 121, { size: 18, weight: 700, color: "#ffffff", width: 284, align: "center" });

  // photo
  const px = 20;
  const py = 144;
  const pw = 130;
  const ph = 174;
  doc.roundedRect(px - 3, py - 3, pw + 6, ph + 6, 11).fill("#ffffff");
  doc
    .roundedRect(px - 3, py - 3, pw + 6, ph + 6, 11)
    .lineWidth(1.6)
    .strokeColor(C.maroon)
    .stroke();
  doc.save().roundedRect(px, py, pw, ph, 9).clip();
  if (photo) doc.image(photo as never, px, py, { cover: [pw, ph], align: "center", valign: "center" });
  else {
    doc.rect(px, py, pw, ph).fill("#f1e4cc");
    t.line("फोटो", px, py + ph / 2, { size: 14, weight: 600, color: C.muted, width: pw, align: "center" });
  }
  doc
    .rect(px, py + ph - 20, pw, 20)
    .fillOpacity(0.88)
    .fill(C.maroon)
    .fillOpacity(1);
  doc.restore();
  t.line(`${card.categoryLabel} · ${card.category === "BRIDE" ? "Bride" : "Groom"}`, px, py + ph - 6, {
    size: 10,
    weight: 700,
    color: "#ffffff",
    width: pw,
    align: "center",
  });

  // details
  const rows = card.rows;
  const top = 146;
  const rowH = Math.min(30, 182 / Math.max(rows.length, 1));
  const lx = 166;
  rows.forEach((row, index) => {
    const base = top + index * rowH + rowH * 0.66;
    icon(doc, row.key, lx, base - 11, 13);
    t.line(`${row.label} :`, lx + 19, base, { size: 10.5, weight: 600, color: C.ink, width: 104, minSize: 8.5 });
    t.line(row.value, lx + 126, base, {
      size: row.key === "name" ? 14 : 12,
      weight: row.key === "name" ? 700 : 600,
      color: row.key === "name" ? C.maroon : C.ink,
      width: 476 - (lx + 126),
      minSize: 8,
    });
    if (index < rows.length - 1)
      doc
        .moveTo(lx, top + (index + 1) * rowH)
        .lineTo(474, top + (index + 1) * rowH)
        .lineWidth(0.7)
        .strokeColor(C.line)
        .stroke();
  });

  // QR verification + profile code
  doc.roundedRect(486, 144, 98, 98, 6).fill("#ffffff");
  doc.roundedRect(486, 144, 98, 98, 6).lineWidth(1.2).strokeColor(C.ink).stroke();
  qr(doc, card.verifyUrl, 490, 148, 90);
  t.line("प्रोफ़ाइल सत्यापन हेतु", 480, 256, { size: 8.5, weight: 600, color: C.ink, width: 110, align: "center" });
  t.line("QR कोड स्कैन करें", 480, 268, { size: 8.5, weight: 600, color: C.ink, width: 110, align: "center" });
  doc.roundedRect(486, 278, 98, 36, 6).fill("#fff4dc");
  doc.roundedRect(486, 278, 98, 36, 6).lineWidth(0.8).strokeColor(C.gold).stroke();
  t.line("प्रोफ़ाइल आईडी", 486, 291, { size: 8, color: C.muted, width: 98, align: "center" });
  t.line(card.profileCode, 486, 306, { size: 11, weight: 700, color: C.maroon, width: 98, align: "center", minSize: 8 });

  // motto pill + footer text
  doc.moveTo(30, 341).lineTo(178, 341).lineWidth(1).strokeColor(C.gold).stroke();
  doc.moveTo(422, 341).lineTo(570, 341).lineWidth(1).strokeColor(C.gold).stroke();
  doc.roundedRect(180, 329, 240, 24, 12).fill(C.maroon);
  doc.roundedRect(180, 329, 240, 24, 12).lineWidth(1.2).strokeColor(C.gold).stroke();
  t.line("NPS Indore – परिवार का अभिन्न अंग", 180, 345, { size: 11, weight: 600, color: "#ffffff", width: 240, align: "center" });
  t.line("शगुन बंधन हेतु यह डिजिटल कार्ड निमाड़ पाटीदार संगठन, इंदौर द्वारा जारी किया गया है।", 16, 386, {
    size: 10.5,
    weight: 600,
    color: "#ffffff",
    width: CARD_W - 32,
    align: "center",
    minSize: 8,
  });
}

function placeCard(doc: Doc, t: Typo, card: CardView, logo: Image, photo: Image | null, x: number, y: number, width: number) {
  doc
    .save()
    .translate(x, y)
    .scale(width / CARD_W);
  drawCard(doc, t, card, logo, photo);
  doc.restore();
}

// ---------- booklet pages ----------
function pageFrame(doc: Doc, t: Typo, meta: BookletMeta, number: number, heading: string | null) {
  doc.rect(0, 0, A4[0], A4[1]).fill(C.page);
  doc
    .rect(16, 16, A4[0] - 32, A4[1] - 32)
    .lineWidth(1.2)
    .strokeColor(C.gold)
    .stroke();
  doc
    .rect(21, 21, A4[0] - 42, A4[1] - 42)
    .lineWidth(0.5)
    .strokeColor(C.goldLight)
    .stroke();
  for (const [x, y, sx, sy] of [
    [24, 24, 1, 1],
    [A4[0] - 24, 24, -1, 1],
    [24, A4[1] - 24, 1, -1],
    [A4[0] - 24, A4[1] - 24, -1, -1],
  ] as const)
    cornerFlourish(doc, x, y, sx, sy, 0.45);
  if (heading !== null) {
    t.line(meta.title, CONTENT.x + 12, 50, { size: 11.5, weight: 700, color: C.maroon, width: 300, minSize: 9 });
    if (heading) {
      const width = t.width(heading, 10.5, 700) + 26;
      doc.roundedRect(CONTENT.x + CONTENT.w - width - 10, 35, width, 22, 11).fill(C.maroon);
      t.line(heading, CONTENT.x + CONTENT.w - width - 10, 50.5, { size: 10.5, weight: 700, color: "#ffffff", width, align: "center" });
    }
    doc
      .moveTo(CONTENT.x, 63)
      .lineTo(CONTENT.x + CONTENT.w, 63)
      .lineWidth(0.8)
      .strokeColor(C.gold)
      .stroke();
  }
  doc
    .moveTo(CONTENT.x, 803)
    .lineTo(CONTENT.x + CONTENT.w, 803)
    .lineWidth(0.6)
    .strokeColor(C.goldLight)
    .stroke();
  t.line("निमाड़ पाटीदार संगठन, इंदौर", CONTENT.x + 12, 818, { size: 8.5, color: C.muted, width: 200 });
  t.line(`पृष्ठ ${number}`, CONTENT.x, 818, { size: 9, weight: 600, color: C.maroon, width: CONTENT.w, align: "center" });
  t.line(meta.edition ? `${meta.edition} · ${meta.year}` : String(meta.year), CONTENT.x + CONTENT.w - 212, 818, {
    size: 8.5,
    color: C.muted,
    width: 200,
    align: "right",
  });
}

function cardSlots(layout: number): { x: number; y: number; w: number }[] {
  if (layout === 1) {
    const w = CONTENT.w;
    const h = (w * CARD_H) / CARD_W;
    return [{ x: CONTENT.x, y: CONTENT.y + (CONTENT.h - h) / 2, w }];
  }
  if (layout === 2) {
    const w = CONTENT.w;
    const h = (w * CARD_H) / CARD_W;
    const gap = (CONTENT.h - 2 * h) / 3;
    return [0, 1].map((index) => ({ x: CONTENT.x, y: CONTENT.y + gap + index * (h + gap), w }));
  }
  const gapX = 12;
  const w = (CONTENT.w - gapX) / 2;
  const h = (w * CARD_H) / CARD_W;
  const rowGap = (CONTENT.h - 2 * h) / 3;
  return [0, 1, 2, 3].map((index) => ({ x: CONTENT.x + (index % 2) * (w + gapX), y: CONTENT.y + rowGap + Math.floor(index / 2) * (h + rowGap), w }));
}

function coverPage(doc: Doc, t: Typo, meta: BookletMeta, logo: Image, cards: CardView[]) {
  doc.rect(0, 0, A4[0], A4[1]).fill(C.page);
  doc
    .rect(16, 16, A4[0] - 32, A4[1] - 32)
    .lineWidth(1.4)
    .strokeColor(C.gold)
    .stroke();
  doc
    .rect(22, 22, A4[0] - 44, A4[1] - 44)
    .lineWidth(0.6)
    .strokeColor(C.goldLight)
    .stroke();
  const panel = { x: 52, y: 70, w: A4[0] - 104, h: 690 };
  const fill = doc
    .linearGradient(0, panel.y, 0, panel.y + panel.h)
    .stop(0, C.maroon)
    .stop(1, C.maroonDark);
  doc.roundedRect(panel.x, panel.y, panel.w, panel.h, 22).fill(fill);
  doc
    .roundedRect(panel.x + 8, panel.y + 8, panel.w - 16, panel.h - 16, 16)
    .lineWidth(1.5)
    .strokeColor(C.gold)
    .stroke();
  doc
    .roundedRect(panel.x + 13, panel.y + 13, panel.w - 26, panel.h - 26, 13)
    .lineWidth(0.5)
    .strokeColor(C.goldLight)
    .stroke();
  for (const [x, y, sx, sy] of [
    [panel.x + 18, panel.y + 18, 1, 1],
    [panel.x + panel.w - 18, panel.y + 18, -1, 1],
    [panel.x + 18, panel.y + panel.h - 18, 1, -1],
    [panel.x + panel.w - 18, panel.y + panel.h - 18, -1, -1],
  ] as const)
    cornerFlourish(doc, x, y, sx, sy, 1.1);
  const logoW = 210;
  doc.image(logo as never, (A4[0] - logoW) / 2, panel.y + 48, { width: logoW });
  const mid = { x: panel.x + 30, w: panel.w - 60 };
  t.line("॥ शुभ विवाह ॥", mid.x, panel.y + 300, { size: 13, weight: 600, color: C.goldLight, width: mid.w, align: "center" });
  t.line("शगुन बंधन", mid.x, panel.y + 362, { size: 46, weight: 700, color: "#ffffff", width: mid.w, align: "center" });
  t.line("वैवाहिक परिचय पुस्तिका", mid.x, panel.y + 404, { size: 25, weight: 700, color: C.goldLight, width: mid.w, align: "center" });
  doc
    .moveTo(A4[0] / 2 - 120, panel.y + 424)
    .lineTo(A4[0] / 2 + 120, panel.y + 424)
    .lineWidth(1)
    .strokeColor(C.gold)
    .stroke();
  if (meta.title && meta.title !== "शगुन बंधन – वैवाहिक परिचय पुस्तिका")
    t.line(meta.title, mid.x, panel.y + 448, { size: 13, weight: 600, color: "#ffffff", width: mid.w, align: "center", minSize: 9 });
  t.line("निमाड़ पाटीदार संगठन, इंदौर", mid.x, panel.y + 478, { size: 20, weight: 700, color: "#ffffff", width: mid.w, align: "center" });
  t.line("॥ समाज सेवा • संस्कार • समर्पण ॥", mid.x, panel.y + 502, { size: 12, weight: 600, color: C.goldLight, width: mid.w, align: "center" });
  const grooms = cards.filter((card) => card.category === "GROOM").length;
  t.line(`कुल परिचय: ${cards.length}   ·   युवक: ${grooms}   ·   युवती: ${cards.length - grooms}`, mid.x, panel.y + 534, {
    size: 11.5,
    color: "#fde9d9",
    width: mid.w,
    align: "center",
  });
  kalash(doc, A4[0] / 2 - 37, panel.y + 552, 0.74);
  t.line(meta.edition ? `संस्करण: ${meta.edition}  ·  वर्ष ${meta.year}` : `वर्ष ${meta.year}`, mid.x, panel.y + 662, {
    size: 12,
    weight: 600,
    color: C.goldLight,
    width: mid.w,
    align: "center",
  });
  t.line("Nimad Patidar Sangathan, Indore · npsindore.org", 0, 792, { size: 9.5, color: C.muted, width: A4[0], align: "center" });
}

function indexPage(doc: Doc, t: Typo, page: Extract<PlannedPage<CardView>, { kind: "index" }>) {
  const title = page.parts > 1 ? `अनुक्रमणिका (${page.part}/${page.parts})` : "अनुक्रमणिका";
  t.line(title, CONTENT.x, 98, { size: 20, weight: 700, color: C.maroon, width: CONTENT.w, align: "center" });
  t.line("Index", CONTENT.x, 114, { size: 9.5, weight: 600, color: C.muted, width: CONTENT.w, align: "center" });
  const cols = [
    { label: "क्र.", w: 40 },
    { label: "नाम", w: 205 },
    { label: "शगुन प्रोफ़ाइल आईडी", w: 120 },
    { label: "श्रेणी", w: 90 },
    { label: "पृष्ठ", w: CONTENT.w - 455 },
  ];
  const top = 126;
  const rowH = 21.5;
  doc.roundedRect(CONTENT.x, top, CONTENT.w, 24, 5).fill(C.maroon);
  let x = CONTENT.x;
  for (const col of cols) {
    t.line(col.label, x + 8, top + 16, { size: 10, weight: 700, color: "#ffffff", width: col.w - 12 });
    x += col.w;
  }
  page.entries.forEach((entry, index) => {
    const y = top + 24 + index * rowH;
    if (index % 2 === 0) doc.rect(CONTENT.x, y, CONTENT.w, rowH).fill("#fbf1dc");
    const values = [
      String(entry.serial),
      entry.card.name,
      entry.card.profileCode,
      `${entry.card.categoryLabel} (${entry.card.category === "BRIDE" ? "Girl" : "Boy"})`,
      String(entry.page),
    ];
    let cx = CONTENT.x;
    values.forEach((value, column) => {
      t.line(value, cx + 8, y + 14.5, {
        size: 10,
        weight: column === 1 ? 600 : 400,
        color: column === 4 ? C.maroon : C.ink,
        width: cols[column].w - 12,
        minSize: 8,
      });
      cx += cols[column].w;
    });
  });
  doc
    .rect(CONTENT.x, top, CONTENT.w, 24 + page.entries.length * rowH)
    .lineWidth(0.6)
    .strokeColor(C.gold)
    .stroke();
}

function closingPage(doc: Doc, t: Typo, meta: BookletMeta, logo: Image) {
  const panel = { x: 64, y: 150, w: A4[0] - 128, h: 540 };
  doc.roundedRect(panel.x, panel.y, panel.w, panel.h, 20).fill("#fff4dc");
  doc.roundedRect(panel.x, panel.y, panel.w, panel.h, 20).lineWidth(1.4).strokeColor(C.gold).stroke();
  doc.image(logo as never, (A4[0] - 130) / 2, panel.y + 28, { width: 130 });
  t.line("शुभकामनाएँ", panel.x, panel.y + 186, { size: 26, weight: 700, color: C.maroon, width: panel.w, align: "center" });
  const text = { x: panel.x + 22, w: panel.w - 44 };
  let y = panel.y + 222;
  for (const message of [
    "विवाह दो परिवारों का पवित्र संस्कार है — आपसी सम्मान, विश्वास और सहमति से निर्णय लें।",
    "शगुन की सभी व्यवस्थाएँ स्वैच्छिक हैं। दहेज़ लेना और देना कानूनन अपराध है।",
    "परिचय की जानकारी स्वयं सत्यापित करें। किसी भी संदेह पर संगठन से संपर्क करें।",
  ])
    y = t.paragraph(message, text.x, y, { size: 12.5, color: C.ink, width: text.w, lineHeight: 19, align: "center" }) + 10;
  doc
    .moveTo(A4[0] / 2 - 90, y + 4)
    .lineTo(A4[0] / 2 + 90, y + 4)
    .lineWidth(0.8)
    .strokeColor(C.gold)
    .stroke();
  y += 30;
  t.line("संपर्क", text.x, y, { size: 13, weight: 700, color: C.maroon, width: text.w, align: "center" });
  y += 20;
  t.line("निमाड़ पाटीदार संगठन, इंदौर", text.x, y, { size: 12, weight: 600, color: C.ink, width: text.w, align: "center" });
  y += 18;
  t.line("info@npsindore.org  ·  npsindore.org", text.x, y, { size: 11, color: C.ink, width: text.w, align: "center" });
  if (meta.contactLine) y = t.paragraph(meta.contactLine, text.x, y + 18, { size: 11, color: C.ink, width: text.w, lineHeight: 16, align: "center" }) - 16;
  t.paragraph("यह पुस्तिका केवल समाज के सदस्यों के उपयोग हेतु है। इसकी जानकारी का व्यावसायिक या अन्य किसी उपयोग हेतु प्रसार वर्जित है।", text.x, panel.y + panel.h - 46, {
    size: 9.5,
    color: C.muted,
    width: text.w,
    lineHeight: 14,
    align: "center",
  });
}

// ---------- documents ----------
const toBuffer = (doc: Doc) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
const newDoc = (title: string) =>
  new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: title, Author: "Nimad Patidar Sangathan, Indore", Creator: "NPS Indore portal" } });
const openImage = (doc: Doc, buffer: Buffer): Image => (doc as unknown as { openImage(source: Buffer): Image }).openImage(buffer);

export async function renderBooklet(cards: CardView[], photos: Map<string, Buffer | null>, options: BookletOptions, meta: BookletMeta) {
  const pages = planBooklet(cards, options);
  const doc = newDoc(meta.title);
  const done = toBuffer(doc);
  const t = new Typo(doc);
  const logo = openImage(doc, asset("nps-logo.png"));
  for (const page of pages) {
    doc.addPage({ size: A4, margin: 0 });
    if (page.kind === "cover") coverPage(doc, t, meta, logo, cards);
    else if (page.kind === "index") {
      pageFrame(doc, t, meta, page.number, "");
      indexPage(doc, t, page);
    } else if (page.kind === "cards") {
      const section: SectionKey = page.section;
      pageFrame(doc, t, meta, page.number, `${SECTION_TITLES[section].hi} · ${SECTION_TITLES[section].en}`);
      const slots = cardSlots(options.layout);
      page.cards.forEach((card, index) => {
        const photo = photos.get(card.profileId);
        placeCard(doc, t, card, logo, photo ? openImage(doc, photo) : null, slots[index].x, slots[index].y, slots[index].w);
      });
    } else {
      pageFrame(doc, t, meta, page.number, null);
      closingPage(doc, t, meta, logo);
    }
  }
  doc.end();
  return { pdf: await done, totalPages: pages.length };
}

// A single card on a page of its own size (600 × 400 pt ≈ 212 × 141 mm): the preview and the "print card" output.
export async function renderCard(card: CardView, photo: Buffer | null) {
  const doc = newDoc(`${card.profileCode} – शगुन बंधन डिजिटल कार्ड`);
  const done = toBuffer(doc);
  const t = new Typo(doc);
  doc.addPage({ size: [CARD_W, CARD_H], margin: 0 });
  drawCard(doc, t, card, openImage(doc, asset("nps-logo.png")), photo ? openImage(doc, photo) : null);
  doc.end();
  return done;
}
