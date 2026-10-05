import { ApiProperty } from "@nestjs/swagger";

export class HealthVo {
  @ApiProperty({ example: true }) ok: true;
  @ApiProperty({ example: "mysql" }) database: "mysql";
  @ApiProperty({ example: "production", description: "APP_ENV, or `development` when unset" }) env: string;
}

export class HealthErrorVo {
  @ApiProperty({ example: false }) ok: false;
  @ApiProperty({ example: "connect ECONNREFUSED 127.0.0.1:3306" }) error: string;
}
