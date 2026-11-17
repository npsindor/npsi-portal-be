import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// Multipart body (documentation only; multer parses it before validation).
export class UploadFileDto {
  @ApiProperty({ type: "string", format: "binary", description: "JPEG, PNG, WEBP or GIF image, max 5 MB" }) file: unknown;
  @ApiPropertyOptional({ description: "reCAPTCHA v3 token; required when the caller is not logged in" }) recaptchaToken?: string;
}
