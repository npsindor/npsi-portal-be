import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fakeRecaptcha, rejectsWith, request, user } from "../testing/fakes.js";
import { UploadsService } from "./uploads.service.js";

const dir = mkdtempSync(path.join(tmpdir(), "npsi-uploads-spec-"));
// Real 1×1 images (uploads are decoded and re-encoded); the JPEG carries an EXIF block with a marker string.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC", "base64");
const JPEG = Buffer.from(
  "/9j/4QDURXhpZgAASUkqAAgAAAAHABIBAwABAAAAAQAAABoBBQABAAAAYgAAABsBBQABAAAAagAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAJiCAgAMAAAAcgAAAGmHBAABAAAAfgAAAAAAAAA4YwAA6AMAADhjAADoAwAARVhJRi1NQVJLRVIABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAEAAAADoAQAAQAAAAEAAAAAAAAA/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8AAEQgAAQABAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAI/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCqQAf/2Q==",
  "base64",
);
const stored = (filename: string, bytes: Buffer, mimetype: string): Express.Multer.File => {
  const file = path.join(dir, filename);
  writeFileSync(file, bytes);
  return { filename, path: file, mimetype } as Express.Multer.File;
};

describe("UploadsService", () => {
  test("a real image gets its public URL from the request's protocol and host", async () => {
    const file = stored("abc.png", PNG, "image/png");
    assert.deepEqual(await new UploadsService(fakeRecaptcha(true).service).toUploadedFile(request(), file), {
      fileUrl: "https://api.npsindore.org/uploads/abc.png",
    });
    assert.equal(
      (await new UploadsService(fakeRecaptcha(true).service).toUploadedFile(request(), stored("abc.jpg", JPEG, "image/jpeg"))).fileUrl.endsWith("abc.jpg"),
      true,
    );
  });
  test("a file whose bytes aren't the declared image type is rejected and deleted", async () => {
    const fake = stored("fake.png", Buffer.from("<html><script>alert(1)</script></html>"), "image/png");
    await rejectsWith(new UploadsService(fakeRecaptcha(true).service).toUploadedFile(request(), fake), 400, "Only JPEG, PNG, WEBP or GIF images are allowed.");
    assert.equal(existsSync(fake.path), false);
    const mislabelled = stored("png-as.webp", PNG, "image/webp");
    await rejectsWith(
      new UploadsService(fakeRecaptcha(true).service).toUploadedFile(request(), mislabelled),
      400,
      "Only JPEG, PNG, WEBP or GIF images are allowed.",
    );
  });
  test("photo metadata (EXIF: GPS, device) is stripped from the stored file", async () => {
    assert.equal(JPEG.includes("EXIF-MARKER"), true);
    const file = stored("exif.jpg", JPEG, "image/jpeg");
    await new UploadsService(fakeRecaptcha(true).service).toUploadedFile(request(), file);
    const kept = readFileSync(file.path);
    assert.equal(kept.includes("EXIF-MARKER"), false);
    assert.equal(kept[0] === 0xff && kept[1] === 0xd8, true);
  });
  test("a file with the right signature that isn't a decodable image is rejected and deleted", async () => {
    const truncated = stored("truncated.png", Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), "image/png");
    await rejectsWith(
      new UploadsService(fakeRecaptcha(true).service).toUploadedFile(request(), truncated),
      400,
      "Only JPEG, PNG, WEBP or GIF images are allowed.",
    );
    assert.equal(existsSync(truncated.path), false);
  });
  test("anonymous uploads need reCAPTCHA (the file is deleted); logged-in members don't", async () => {
    const anonymous = stored("anon.png", PNG, "image/png");
    await rejectsWith(new UploadsService(fakeRecaptcha(false).service).toUploadedFile(request(), anonymous), 400, /reCAPTCHA/);
    assert.equal(existsSync(anonymous.path), false);
    const member = stored("member.png", PNG, "image/png");
    assert.equal((await new UploadsService(fakeRecaptcha(false).service).toUploadedFile(request(), member, user())).fileUrl.endsWith("member.png"), true);
  });
  test("400 when no file was sent", async () => {
    await rejectsWith(new UploadsService(fakeRecaptcha(true).service).toUploadedFile(request(), undefined), 400, "No file uploaded.");
  });
});
