import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import { AppConfigService } from "../config/app-config.service.js";

export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const SCREENSHOT_TYPE = "Payment screenshot must be a JPG, PNG or WEBP image of at most 5 MB.";
const KINDS: { mime: string; ext: string; matches: (head: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", matches: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  { mime: "image/png", ext: "png", matches: (h) => h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", matches: (h) => h.subarray(0, 4).toString("latin1") === "RIFF" && h.subarray(8, 12).toString("latin1") === "WEBP" },
];
// "<owner user id>.<uuid>.<ext>": the owner is part of the name, so one account can't attach another's file.
const NAME = /^([0-9a-zA-Z-]{1,64})\.([0-9a-f-]{36})\.(jpg|png|webp)$/;

// Payment screenshots show bank / UPI details, so they are kept outside the public uploads folder
// and served only to their owner and to admins.
@Injectable()
export class PaymentFilesService {
  constructor(private readonly config: AppConfigService) {}

  private dir(): string {
    const root = this.config.paymentsDir;
    const relative = path.relative(path.resolve(this.config.uploadsDir), root);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
      throw new ApiError(500, "Payment storage must be outside the public uploads folder.");
    return root;
  }

  async save(ownerId: string, file: Express.Multer.File | undefined): Promise<string> {
    if (!file?.buffer?.length || file.size > MAX_SCREENSHOT_BYTES) throw new ApiError(400, SCREENSHOT_TYPE);
    const kind = KINDS.find((candidate) => candidate.mime === file.mimetype && candidate.matches(file.buffer.subarray(0, 12)));
    if (!kind) throw new ApiError(400, SCREENSHOT_TYPE);
    const root = this.dir();
    await mkdir(root, { recursive: true, mode: 0o700 });
    const name = `${ownerId}.${randomId()}.${kind.ext}`;
    await writeFile(path.join(root, name), file.buffer, { mode: 0o600, flag: "wx" });
    return name;
  }

  // The stored file name, after checking it belongs to `ownerId` and exists.
  async claim(ownerId: string, fileId: string | null | undefined): Promise<string> {
    const match = NAME.exec(fileId || "");
    if (!match || match[1] !== ownerId) throw new ApiError(400, "Please upload the payment screenshot again.");
    try {
      await access(path.join(this.dir(), match[0]));
    } catch {
      throw new ApiError(400, "Please upload the payment screenshot again.");
    }
    return match[0];
  }

  async read(name: string): Promise<{ buffer: Buffer; mime: string }> {
    const match = NAME.exec(name);
    if (!match) throw new ApiError(404, "Record not found");
    try {
      return { buffer: await readFile(path.join(this.dir(), match[0])), mime: KINDS.find((kind) => kind.ext === match[3])?.mime ?? "application/octet-stream" };
    } catch {
      throw new ApiError(404, "Record not found");
    }
  }

  async remove(name: string | null | undefined): Promise<void> {
    if (name && NAME.test(name)) await unlink(path.join(this.dir(), name)).catch(() => undefined);
  }
}
