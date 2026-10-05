import type { EntityDefinition } from "./entity-definitions.js";

// Controller path for an entity (relative to the global /api prefix) and the
// sub-path for creating several records at once.
export const entityPath = (definition: EntityDefinition): string => `entities/${definition.name}`;
export const BATCH_PATH = "bulk";
