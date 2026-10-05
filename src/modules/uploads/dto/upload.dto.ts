import { ApiProperty } from "@nestjs/swagger";

// Multipart body (documentation only; multer parses it before validation).
export class UploadFileDto {
  @ApiProperty({ type: "string", format: "binary", description: "JPEG, PNG, WEBP or GIF image, max 5 MB" }) file: unknown;
}
