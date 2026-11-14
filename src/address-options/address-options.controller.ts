import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Param,
  Patch,
  Post,
  Query,
  RequestMethod,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ApiError } from "../common/filters/api-error.js";
import { ErrorVo } from "../common/filters/error.vo.js";
import { AdminGuard } from "../common/guards/auth.guards.js";
import { publicLookupLimiter } from "../common/rate-limit/limiters.js";
import { randomId } from "../common/utils/crypto.js";
import { isUniqueViolation } from "../common/utils/display-ids.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { OptionalBoolean, OptionalInt, OptionalText, RequiredChoice, RequiredText } from "../common/validation/fields.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AddressOption } from "../generated/prisma/client.js";
import { CITIES } from "../registrations/registration.rules.js";

// Areas / PIN codes can also be listed for the extra cities offered in the Sagun form.
export const ADDRESS_CITIES = [...CITIES, "Khargone", "Pithampur"] as const;
// RENTAL_AREA and PROPERTY_TYPE are the Room Hunting pickers; like villages they belong to no city.
export const ADDRESS_KINDS = ["AREA", "PINCODE", "VILLAGE", "RENTAL_AREA", "PROPERTY_TYPE"] as const;
const CITYLESS = ["VILLAGE", "RENTAL_AREA", "PROPERTY_TYPE"];
const PATH = "address-options";

export class AddressOptionsQueryDto {
  @ApiPropertyOptional({ enum: ADDRESS_KINDS }) @IsOptional() @IsIn(ADDRESS_KINDS) kind?: string;
  @ApiPropertyOptional({ enum: ADDRESS_CITIES, description: "Areas and PIN codes belong to a city; villages don't" })
  @IsOptional()
  @IsIn(ADDRESS_CITIES)
  city?: string;
  @ApiPropertyOptional({ description: "Admins: include inactive entries" }) @IsOptional() @IsIn(["true", "false"]) all?: string;
}
export class CreateAddressOptionDto {
  @RequiredChoice(ADDRESS_KINDS, "Kind is required.") kind!: string;
  @OptionalText(64, { description: "City for areas and PIN codes (Indore, Ujjain, Dewas, Khargone, Pithampur)" }) city?: string | null;
  @RequiredText("Value is required.", 150) value!: string;
  @OptionalText(150, { description: "Hindi label" }) labelHi?: string | null;
  @OptionalInt() sortOrder?: number | null;
  @OptionalBoolean() active?: boolean | null;
}
export class UpdateAddressOptionDto {
  @OptionalText(150) value?: string | null;
  @OptionalText(150) labelHi?: string | null;
  @OptionalInt() sortOrder?: number | null;
  @OptionalBoolean() active?: boolean | null;
}
export class AddressOptionVo {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ADDRESS_KINDS }) kind!: string;
  @ApiProperty() city!: string;
  @ApiProperty() value!: string;
  @ApiProperty({ nullable: true, type: String }) labelHi!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() active!: boolean;
}
const toVo = (row: AddressOption): AddressOptionVo => ({
  id: row.id,
  kind: row.kind,
  city: row.city,
  value: row.value,
  labelHi: row.labelHi,
  sortOrder: row.sortOrder,
  active: row.active,
});

// Admin-managed dropdown lists for registration addresses: areas and PIN codes per city, native villages.
@Injectable()
export class AddressOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AddressOptionsQueryDto, includeInactive: boolean): Promise<AddressOptionVo[]> {
    const city = query.kind && CITYLESS.includes(query.kind) ? "" : query.city;
    const rows = await this.prisma.addressOption.findMany({
      where: { ...(query.kind ? { kind: query.kind } : {}), ...(city !== undefined ? { city } : {}), ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ kind: "asc" }, { city: "asc" }, { sortOrder: "asc" }, { value: "asc" }],
      take: 2000,
    });
    return rows.map(toVo);
  }

  async create(dto: CreateAddressOptionDto): Promise<AddressOptionVo> {
    assertNoMarkup(dto);
    const city = CITYLESS.includes(dto.kind) ? "" : (dto.city ?? "").trim();
    if (!CITYLESS.includes(dto.kind) && !(ADDRESS_CITIES as readonly string[]).includes(city))
      throw new ApiError(400, "City is required for areas and PIN codes.");
    const value = dto.value.trim();
    if (dto.kind === "PINCODE" && !/^[1-9]\d{5}$/.test(value)) throw new ApiError(400, "A valid 6-digit PIN code is required.");
    try {
      const row = await this.prisma.addressOption.create({
        data: { id: randomId(), kind: dto.kind, city, value, labelHi: dto.labelHi?.trim() || null, sortOrder: dto.sortOrder ?? 0, active: dto.active ?? true },
      });
      return toVo(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError(409, "This entry already exists.");
      throw error;
    }
  }

  async update(id: string, dto: UpdateAddressOptionDto): Promise<AddressOptionVo> {
    assertNoMarkup(dto);
    const existing = await this.prisma.addressOption.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Record not found");
    const value = dto.value?.trim();
    if (value !== undefined && existing.kind === "PINCODE" && !/^[1-9]\d{5}$/.test(value)) throw new ApiError(400, "A valid 6-digit PIN code is required.");
    try {
      const row = await this.prisma.addressOption.update({
        where: { id },
        data: {
          value: value || undefined,
          labelHi: dto.labelHi === undefined ? undefined : dto.labelHi?.trim() || null,
          sortOrder: dto.sortOrder ?? undefined,
          active: dto.active ?? undefined,
        },
      });
      return toVo(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError(409, "This entry already exists.");
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.prisma.addressOption.deleteMany({ where: { id } });
  }
}

@ApiTags("address-options")
@Controller(PATH)
export class AddressOptionsController {
  constructor(private readonly service: AddressOptionsService) {}

  @Get()
  @ApiOperation({ summary: "Active areas / PIN codes (per city) and native villages for the registration form" })
  @ApiOkResponse({ type: [AddressOptionVo] })
  list(@Query() query: AddressOptionsQueryDto): Promise<AddressOptionVo[]> {
    return this.service.list(query, false);
  }

  @Get("all")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Every entry, inactive included — admin only" })
  @ApiOkResponse({ type: [AddressOptionVo] })
  @ApiForbiddenResponse({ type: ErrorVo })
  all(@Query() query: AddressOptionsQueryDto): Promise<AddressOptionVo[]> {
    return this.service.list(query, true);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add an area, PIN code or village — admin only" })
  @ApiCreatedResponse({ type: AddressOptionVo })
  @ApiBadRequestResponse({ type: ErrorVo })
  @ApiConflictResponse({ type: ErrorVo, description: "Already in the list" })
  @ApiForbiddenResponse({ type: ErrorVo })
  create(@Body() dto: CreateAddressOptionDto): Promise<AddressOptionVo> {
    return this.service.create(dto);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Rename, re-order or (de)activate an entry — admin only" })
  @ApiOkResponse({ type: AddressOptionVo })
  @ApiNotFoundResponse({ type: ErrorVo })
  @ApiForbiddenResponse({ type: ErrorVo })
  update(@Param("id") id: string, @Body() dto: UpdateAddressOptionDto): Promise<AddressOptionVo> {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete an entry — admin only" })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorVo })
  remove(@Param("id") id: string): Promise<void> {
    return this.service.remove(id);
  }
}

@Module({ controllers: [AddressOptionsController], providers: [AddressOptionsService] })
export class AddressOptionsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(publicLookupLimiter).forRoutes({ path: PATH, method: RequestMethod.GET });
  }
}
