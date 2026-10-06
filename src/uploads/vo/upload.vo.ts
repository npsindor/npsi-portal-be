import { ApiProperty } from "@nestjs/swagger";

export class UploadedFileVo {
  @ApiProperty({ example: "https://api.npsindore.org/uploads/0b6e…png", description: "Public URL of the stored image" }) fileUrl: string;
}
