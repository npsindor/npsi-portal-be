import type { EntityDefinition } from "./entity-definitions.js";

// Controller path for an entity (relative to the global /api/v1 prefix): its
// plural kebab-case resource name, plus the sub-path for creating several
// records at once.
export const entityPath = (definition: EntityDefinition): string => definition.resource;
export const BATCH_PATH = "batch";
