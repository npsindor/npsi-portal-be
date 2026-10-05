import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rejectsWith, request } from "../testing/fakes.js";
import { UploadsService } from "./uploads.service.js";

describe("UploadsService", () => {
  test("public URL from the request's protocol and host", () => {
    const file = { filename: "abc.png" } as Express.Multer.File;
    assert.deepEqual(new UploadsService().toUploadedFile(request(), file), { file_url: "https://api.npsindore.org/uploads/abc.png" });
  });
  test("400 when no file was sent", async () => {
    await rejectsWith(
      Promise.resolve().then(() => new UploadsService().toUploadedFile(request(), undefined)),
      400,
      "No file uploaded.",
    );
  });
});
