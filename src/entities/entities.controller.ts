import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res, type Type } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ErrorVo } from "../common/filters/error.vo.js";
import { ENTITY_BATCH_DTOS, ENTITY_DTOS, type EntityBody, ListQueryDto } from "./dto/entity.dto.js";
import { BATCH_PATH, entityPath } from "./entities.routes.js";
import { EntitiesService } from "./entities.service.js";
import { ENTITY_DEFINITIONS, ENTITY_NAMES, type EntityName } from "./entity-definitions.js";
import { AUTH_CREATE_ENTITIES, AUTH_READ_ENTITIES, OWNERSHIP_ENTITIES, PUBLIC_CREATE_ENTITIES, PUBLIC_READ_ENTITIES } from "./entity-rules.js";
import { ENTITY_VOS, type EntityVo } from "./vo/entity.vo.js";

const readAccess = (name: EntityName): string =>
  PUBLIC_READ_ENTITIES.has(name)
    ? "Public."
    : AUTH_READ_ENTITIES.has(name)
      ? "Any logged-in user (members see their own family's and broadcast rows)."
      : "Admin only.";
const createAccess = (name: EntityName): string =>
  PUBLIC_CREATE_ENTITIES.has(name)
    ? "Public."
    : OWNERSHIP_ENTITIES.has(name)
      ? name === "Family"
        ? "Admin only."
        : "Admins, or members for their own family."
      : AUTH_CREATE_ENTITIES.has(name)
        ? "Any logged-in user."
        : "Admin only.";
const writeAccess = (name: EntityName): string =>
  OWNERSHIP_ENTITIES.has(name)
    ? "Admins, or members for their own family."
    : AUTH_READ_ENTITIES.has(name)
      ? "Admins, or members for their own notifications."
      : "Admin only.";
const deleteAccess = (name: EntityName): string => (name === "FamilyMember" ? "Admins, or members for their own family." : "Admin only.");

// One thin controller per entity, all delegating to EntitiesService. Built by a
// factory so each resource gets its own route, Swagger tag, DTO and VO.
const createEntityController = (name: EntityName): Type<unknown> => {
  const definition = ENTITY_DEFINITIONS[name];
  const Dto = ENTITY_DTOS[name];
  const BatchDto = ENTITY_BATCH_DTOS[name];
  const Vo = ENTITY_VOS[name];

  @ApiTags(definition.resource)
  @ApiBearerAuth()
  @Controller(entityPath(definition))
  class EntityController {
    constructor(readonly entities: EntitiesService) {}

    @Get()
    @ApiOperation({ summary: `List ${definition.resource}`, description: readAccess(name) })
    @ApiOkResponse({ type: Vo, isArray: true })
    @ApiUnauthorizedResponse({ type: ErrorVo })
    @ApiForbiddenResponse({ type: ErrorVo })
    list(@Query() query: ListQueryDto, @Req() request: Request): Promise<EntityVo[]> {
      return this.entities.list(name, query, request);
    }

    @Post()
    @ApiOperation({ summary: `Create a ${name} record`, description: createAccess(name) })
    @ApiBody({ type: Dto })
    @ApiCreatedResponse({ type: Vo })
    @ApiBadRequestResponse({ type: ErrorVo, description: "Validation failed or a field contains < or >" })
    @ApiUnauthorizedResponse({ type: ErrorVo })
    @ApiForbiddenResponse({ type: ErrorVo, description: "Not allowed for this record" })
    @ApiNotFoundResponse({ type: ErrorVo, description: "Referenced record not found" })
    @ApiConflictResponse({ type: ErrorVo, description: "Mobile or email already registered" })
    create(@Body() body: EntityBody, @Req() request: Request): Promise<EntityVo> {
      return this.entities.create(name, body, request);
    }

    @Post(BATCH_PATH)
    @ApiOperation({ summary: `Create several ${name} records at once`, description: "Admin only. Returns 200 with [] when no records are sent." })
    @ApiBody({ type: BatchDto })
    @ApiCreatedResponse({ type: Vo, isArray: true })
    @ApiOkResponse({ type: Vo, isArray: true, description: "Nothing to create" })
    @ApiUnauthorizedResponse({ type: ErrorVo })
    @ApiForbiddenResponse({ type: ErrorVo })
    async createBatch(@Body() body: { records?: EntityBody[] }, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<EntityVo[]> {
      const result = await this.entities.createBatch(name, body, request);
      response.status(result.status);
      return result.records;
    }

    @Patch(":id")
    @ApiOperation({ summary: `Update a ${name} record`, description: writeAccess(name) })
    @ApiParam({ name: "id", description: "Record id" })
    @ApiBody({ type: Dto })
    @ApiOkResponse({ type: Vo })
    @ApiBadRequestResponse({ type: ErrorVo, description: "A field contains < or >" })
    @ApiUnauthorizedResponse({ type: ErrorVo })
    @ApiForbiddenResponse({ type: ErrorVo })
    @ApiNotFoundResponse({ type: ErrorVo, description: "Record not found" })
    update(@Param("id") id: string, @Body() body: EntityBody, @Req() request: Request): Promise<EntityVo> {
      return this.entities.update(name, id, body, request);
    }

    @Delete(":id")
    @HttpCode(204)
    @ApiOperation({ summary: `Delete a ${name} record`, description: deleteAccess(name) })
    @ApiParam({ name: "id", description: "Record id" })
    @ApiNoContentResponse({ description: "Deleted (also when the id did not exist)" })
    @ApiUnauthorizedResponse({ type: ErrorVo })
    @ApiForbiddenResponse({ type: ErrorVo })
    remove(@Param("id") id: string, @Req() request: Request): Promise<void> {
      return this.entities.remove(name, id, request);
    }
  }

  // Bind the per-entity DTOs so the global ValidationPipe whitelists bodies.
  Reflect.defineMetadata("design:paramtypes", [Dto, Object], EntityController.prototype, "create");
  Reflect.defineMetadata("design:paramtypes", [BatchDto, Object, Object], EntityController.prototype, "createBatch");
  Reflect.defineMetadata("design:paramtypes", [String, Dto, Object], EntityController.prototype, "update");
  Object.defineProperty(EntityController, "name", { value: `${name}Controller` });
  return EntityController;
};

export const ENTITY_CONTROLLERS = ENTITY_NAMES.map(createEntityController);
