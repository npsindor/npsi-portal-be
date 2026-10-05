import { ApiProperty } from "@nestjs/swagger";
import type { ErrorBody } from "./api-error.js";

// Swagger schema for the error body every endpoint returns on failure.
export class ErrorVo implements ErrorBody {
  @ApiProperty({ example: "Authentication required." }) error: string;
}

export class OkVo {
  @ApiProperty({ example: true }) ok: true;
}
