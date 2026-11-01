import type { Document, Meta, ResourceIdentifier } from './types.js';

/**
 * A relationship value for a write: an identifier (or any resource, of
 * which only `type`, `id` and `meta` are sent), a list of them, or NULL to
 * empty it.
 */
export type RelationshipInput =
  | { type: string; id: string; meta?: Meta }
  | Array<{ type: string; id: string; meta?: Meta }>
  | null;

export interface ResourceInput {
  /** Set for updates; optional client-generated UUID for creates. */
  id?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, RelationshipInput>;
  meta?: Meta;
}

/** Builds the request document for creating or updating a resource. */
export function serialize(type: string, input: ResourceInput): Document {
  const data: Record<string, unknown> = { type };
  if (input.id !== undefined) data.id = input.id;
  if (input.attributes && Object.keys(input.attributes).length) data.attributes = input.attributes;
  if (input.relationships && Object.keys(input.relationships).length) {
    data.relationships = Object.fromEntries(
      Object.entries(input.relationships).map(([name, value]) => [
        name,
        { data: value === null ? null : Array.isArray(value) ? value.map(identifier) : identifier(value) },
      ]),
    );
  }
  if (input.meta) data.meta = input.meta;
  return { data: data as unknown as Document['data'] };
}

/** Reduces a resource (or identifier) to a resource identifier object. */
export function identifier(value: { type: string; id: string; meta?: Meta }): ResourceIdentifier {
  return value.meta ? { type: value.type, id: value.id, meta: value.meta } : { type: value.type, id: value.id };
}
