import { ApiProperty } from "@nestjs/swagger";

export class HealthVo {
  @ApiProperty({ example: true }) ok: true;
}

export class HealthErrorVo {
  @ApiProperty({ example: false }) ok: false;
  @ApiProperty({ example: "Service unavailable." }) error: string;
}
