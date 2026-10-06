import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { rejectsWith, request } from "../testing/fakes.js";
import { UploadsService } from "./uploads.service.js";

const dir = mkdtempSync(path.join(tmpdir(), "npsi-uploads-spec-"));
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const JPEG = Buffer.from("ffd8ffe000104a464946", "hex");
const stored = (filename: string, bytes: Buffer, mimetype: string): Express.Multer.File => {
  const file = path.join(dir, filename);
  writeFileSync(file, bytes);
  return { filename, path: file, mimetype } as Express.Multer.File;
};

describe("UploadsService", () => {
  test("a real image gets its public URL from the request's protocol and host", async () => {
    const file = stored("abc.png", PNG, "image/png");
    assert.deepEqual(await new UploadsService().toUploadedFile(request(), file), { fileUrl: "https://api.npsindore.org/uploads/abc.png" });
    assert.equal((await new UploadsService().toUploadedFile(request(), stored("abc.jpg", JPEG, "image/jpeg"))).fileUrl.endsWith("abc.jpg"), true);
  });
  test("a file whose bytes aren't the declared image type is rejected and deleted", async () => {
    const fake = stored("fake.png", Buffer.from("<html><script>alert(1)</script></html>"), "image/png");
    await rejectsWith(new UploadsService().toUploadedFile(request(), fake), 400, "Only JPEG, PNG, WEBP or GIF images are allowed.");
    assert.equal(existsSync(fake.path), false);
    const mislabelled = stored("png-as.webp", PNG, "image/webp");
    await rejectsWith(new UploadsService().toUploadedFile(request(), mislabelled), 400, "Only JPEG, PNG, WEBP or GIF images are allowed.");
  });
  test("400 when no file was sent", async () => {
    await rejectsWith(new UploadsService().toUploadedFile(request(), undefined), 400, "No file uploaded.");
  });
});
