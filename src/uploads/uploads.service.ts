import { open, unlink } from "node:fs/promises";
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../common/filters/api-error.js";
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

@Injectable()
export class UploadsService {
  // Public URL of a stored upload, once its content is confirmed to be the
  // declared image type (otherwise it is deleted). Uses the request's
  // protocol/host (trust proxy is set, so it is https behind Hostinger's proxy).
  async toUploadedFile(request: Request, file: Express.Multer.File | undefined): Promise<UploadedFileVo> {
    if (!file) throw new ApiError(400, "No file uploaded.");
    const matches = SIGNATURES[file.mimetype];
    if (!matches || !matches(await readHead(file.path))) {
      await unlink(file.path).catch(() => undefined);
      throw new ApiError(400, NOT_AN_IMAGE);
    }
    return { fileUrl: `${request.protocol}://${request.get("host")}/uploads/${file.filename}` };
  }
}
