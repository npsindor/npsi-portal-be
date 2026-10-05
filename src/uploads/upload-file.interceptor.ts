import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import multer, { type Multer } from "multer";
import { from, Observable, switchMap } from "rxjs";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import { AppConfigService } from "../config/app-config.service.js";

// Only real image bytes, max 5 MB, stored under a server-generated name. The
// client's filename/extension is never used (no path traversal, no ".php
// disguised as .jpg").
export const UPLOAD_MIME_EXTENSIONS: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Runs multer itself (instead of Nest's FileInterceptor) so every upload error
// is a 400 with multer's message, exactly like the legacy endpoint.
@Injectable()
export class UploadFileInterceptor implements NestInterceptor {
  private readonly upload: Multer;

  constructor(config: AppConfigService) {
    const dir = config.uploadsDir;
    this.upload = multer({
      storage: multer.diskStorage({
        destination: (_request, _file, callback) => callback(null, dir),
        filename: (_request, file, callback) => callback(null, `${randomId()}${UPLOAD_MIME_EXTENSIONS[file.mimetype] || ""}`),
      }),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_request, file, callback) => {
        if (!UPLOAD_MIME_EXTENSIONS[file.mimetype]) return callback(new Error("Only JPEG, PNG, WEBP or GIF images are allowed."));
        callback(null, true);
      },
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const parsed = new Promise<void>((resolve, reject) => {
      this.upload.single("file")(request, response, (error: unknown) => {
        if (error) reject(new ApiError(400, (error as Error).message || "Upload failed."));
        else resolve();
      });
    });
    return from(parsed).pipe(switchMap(() => next.handle()));
  }
}
