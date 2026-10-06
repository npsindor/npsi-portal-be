import { Controller, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiConsumes, ApiCreatedResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from "@nestjs/swagger";
import type { Request } from "express";
import { ErrorVo } from "../common/filters/error.vo.js";
import { UploadFileDto } from "./dto/upload.dto.js";
import { UploadFileInterceptor } from "./upload-file.interceptor.js";
import { UPLOAD_ROUTE } from "./uploads.routes.js";
import { UploadsService } from "./uploads.service.js";
import { UploadedFileVo } from "./vo/upload.vo.js";

@ApiTags("uploads")
@Controller(UPLOAD_ROUTE)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @UseInterceptors(UploadFileInterceptor)
  @ApiOperation({ summary: "Upload an image (public; used by registration forms, events and feedback)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: UploadFileDto })
  @ApiCreatedResponse({ type: UploadedFileVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "No file, not an image, or larger than 5 MB" })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  upload(@Req() request: Request, @UploadedFile() file: Express.Multer.File | undefined): Promise<UploadedFileVo> {
    return this.uploads.toUploadedFile(request, file);
  }
}
