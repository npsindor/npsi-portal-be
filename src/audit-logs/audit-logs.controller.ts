import { Controller, Get, Global, Module, Query, UseGuards } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard } from "../common/guards/auth.guards.js";
import { AuditLogsInterceptor } from "./audit-logs.interceptor.js";
import { AuditLogsService } from "./audit-logs.service.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AuditListDto {
  @ApiPropertyOptional({ description: "Search name, id, actor or path" }) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ example: "families" }) @IsOptional() @IsString() @MaxLength(80) resource?: string;
  @ApiPropertyOptional({ enum: ["SUPER_ADMIN", "ADMIN_STAFF", "MEMBER"] }) @IsOptional() @IsString() @MaxLength(24) role?: string;
  @ApiPropertyOptional({ example: "2026-11-01" }) @IsOptional() @Matches(DATE) from?: string;
  @ApiPropertyOptional({ example: "2026-11-30" }) @IsOptional() @Matches(DATE) to?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 }) @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
  @ApiPropertyOptional({ minimum: 0, default: 0 }) @Type(() => Number) @IsOptional() @IsInt() @Min(0) offset?: number;
}

@ApiTags("Audit log")
@Controller("audit-logs")
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Super admin: every deletion — who, when, what, and a copy of the deleted record (read only)" })
  @ApiOkResponse({ description: "{ rows, total, resources }" })
  @ApiForbiddenResponse({ type: ErrorVo, description: "Not the super admin" })
  list(@Query() query: AuditListDto) {
    return this.service.list(query);
  }
}

@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, { provide: APP_INTERCEPTOR, useClass: AuditLogsInterceptor }],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
