import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../common/filters/api-error.js";
import type { UploadedFileVo } from "./vo/upload.vo.js";

@Injectable()
export class UploadsService {
  // Public URL of a stored upload. Uses the request's protocol/host (trust
  // proxy is set, so it is https behind Hostinger's proxy).
  toUploadedFile(request: Request, file: Express.Multer.File | undefined): UploadedFileVo {
    if (!file) throw new ApiError(400, "No file uploaded.");
    return { file_url: `${request.protocol}://${request.get("host")}/uploads/${file.filename}` };
  }
}
