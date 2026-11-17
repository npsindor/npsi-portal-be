import { Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiConsumes, ApiCreatedResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from "@nestjs/swagger";
import type { Request } from "express";
import { OptionalUser } from "../common/decorators/current-user.decorator.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { OptionalUserGuard } from "../common/guards/auth.guards.js";
import type { UserRow } from "../common/session/session.service.js";
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
  @UseGuards(OptionalUserGuard)
  @UseInterceptors(UploadFileInterceptor)
  @ApiOperation({
    summary: "Upload an image (public; used by registration forms, events and feedback)",
    description: "Without a login the multipart body must also carry `recaptchaToken`. Photo metadata (EXIF) is removed.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: UploadFileDto })
  @ApiCreatedResponse({ type: UploadedFileVo })
  @ApiBadRequestResponse({ type: ErrorVo, description: "No file, not an image, larger than 5 MB, or reCAPTCHA failed (anonymous uploads)" })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  upload(@Req() request: Request, @UploadedFile() file: Express.Multer.File | undefined, @OptionalUser() user: UserRow | null): Promise<UploadedFileVo> {
    return this.uploads.toUploadedFile(request, file, user);
  }
}
