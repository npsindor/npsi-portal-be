import { open, rename, unlink, writeFile } from "node:fs/promises";
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../common/filters/api-error.js";
import { RECAPTCHA_FAILED, RecaptchaService } from "../common/recaptcha/recaptcha.service.js";
import type { UserRow } from "../common/session/session.service.js";
import type { UploadedFileVo } from "./vo/upload.vo.js";

export const NOT_AN_IMAGE = "Only JPEG, PNG, WEBP or GIF images are allowed.";

// What each accepted type's file must start with. The browser's declared type
// alone can be anything (an HTML page labelled image/png would then be served
// from our domain), so the stored bytes are checked too.
const SIGNATURES: Record<string, (head: Buffer) => boolean> = {
  "image/jpeg": (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  "image/png": (head) => head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/gif": (head) => head.subarray(0, 6).toString("latin1") === "GIF87a" || head.subarray(0, 6).toString("latin1") === "GIF89a",
  "image/webp": (head) => head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP",
};

const readHead = async (path: string): Promise<Buffer> => {
  const file = await open(path, "r");
  try {
    const head = Buffer.alloc(12);
    const { bytesRead } = await file.read(head, 0, 12, 0);
    return head.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
};

// sharp is loaded lazily, like the Sagun cards do: if its native build can't load on a server,
// uploads still work and are kept as sent (with a warning), rather than every upload failing.
type Sharp = typeof import("sharp");
let sharpModule: Promise<Sharp | null> | null = null;
const loadSharp = (): Promise<Sharp | null> => {
  sharpModule ??= import("sharp")
    .then((module) => (module.default ?? module) as unknown as Sharp)
    .catch((error: unknown) => {
      console.warn("⚠️  sharp could not be loaded; uploaded photos keep their metadata:", error instanceof Error ? error.message : error);
      return null;
    });
  return sharpModule;
};

// Phone photos carry EXIF metadata (GPS position, device, capture time) and uploads are public by URL.
// Re-encoding drops all of it (sharp writes no metadata unless asked), applies the EXIF rotation first so
// the photo stays upright, and turns any image/HTML polyglot into a plain image. GIFs are kept as sent:
// they carry no EXIF and re-encoding would flatten animations.
const RE_ENCODE: Partial<Record<string, (image: import("sharp").Sharp) => import("sharp").Sharp>> = {
  "image/jpeg": (image) => image.jpeg({ quality: 88, mozjpeg: true }),
  "image/png": (image) => image.png(),
  "image/webp": (image) => image.webp({ quality: 88 }),
};

const stripMetadata = async (file: Express.Multer.File): Promise<boolean> => {
  const encode = RE_ENCODE[file.mimetype];
  const sharp = encode ? await loadSharp() : null;
  if (!encode || !sharp) return true;
  try {
    const clean = await encode(sharp(file.path, { failOn: "error" }).rotate()).toBuffer();
    const temp = `${file.path}.clean`;
    await writeFile(temp, clean);
    await rename(temp, file.path);
    return true;
  } catch {
    return false; // right signature but not a decodable image
  }
};

@Injectable()
export class UploadsService {
  constructor(private readonly recaptcha: RecaptchaService) {}

  // Public URL of a stored upload, once its content is confirmed to be the
  // declared image type and its metadata is stripped (otherwise it is deleted).
  // Uses the request's protocol/host (trust proxy is set, so it is https behind Hostinger's proxy).
  // Anonymous uploads (registration forms, before an account exists) must pass reCAPTCHA, so bots can't
  // use the server as free public image hosting; logged-in members upload without it.
  async toUploadedFile(request: Request, file: Express.Multer.File | undefined, user: UserRow | null = null): Promise<UploadedFileVo> {
    if (!file) throw new ApiError(400, "No file uploaded.");
    if (!user && !(await this.recaptcha.verify((request.body as { recaptchaToken?: unknown } | undefined)?.recaptchaToken))) {
      await unlink(file.path).catch(() => undefined);
      throw new ApiError(400, RECAPTCHA_FAILED);
    }
    const matches = SIGNATURES[file.mimetype];
    if (!matches?.(await readHead(file.path)) || !(await stripMetadata(file))) {
      await unlink(file.path).catch(() => undefined);
      throw new ApiError(400, NOT_AN_IMAGE);
    }
    return { fileUrl: `${request.protocol}://${request.get("host")}/uploads/${file.filename}` };
  }
}
