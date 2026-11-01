/**
 * JSON:API 1.1 wire types, as Drupal emits them, plus the deserialized
 * resource shape the client hands to application code.
 */

export type Meta = Record<string, unknown>;

export interface Link {
  href: string;
  meta?: Meta;
}

export type Links = Record<string, Link>;

export interface ResourceIdentifier {
  type: string;
  id: string;
  meta?: Meta;
}

export interface Relationship {
  data?: ResourceIdentifier | ResourceIdentifier[] | null;
  links?: Links;
  meta?: Meta;
}

export interface ResourceObject {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, Relationship>;
  links?: Links;
  meta?: Meta;
}

export interface ErrorObject {
  id?: string;
  status?: string;
  title?: string;
  detail?: string;
  code?: string;
  source?: { pointer?: string; parameter?: string; header?: string };
  links?: Links;
  meta?: Meta;
}

export interface Document {
  jsonapi?: { version?: string; meta?: Meta };
  data?: ResourceObject | ResourceObject[] | null;
  included?: ResourceObject[];
  errors?: ErrorObject[];
  links?: Links;
  meta?: Meta;
}

/**
 * The fields every deserialized resource has. Use it to describe your own
 * resource types:
 *
 * ```ts
 * interface NodeArticle extends ResourceBase<'node--article'> {
 *   title: string;
 *   field_image: ToOne<File>;
 * }
 * ```
 */
export interface ResourceBase<TType extends string = string> {
  id: string;
  type: TType;
  meta?: Meta;
  links?: Links;
  /**
   * The relationship identifier's meta, when this resource was reached
   * through a relationship (an image field's alt, width and height).
   */
  relationshipMeta?: Meta;
}

/**
 * A deserialized resource: attributes and relationships flattened onto one
 * object, relationships replaced by the included resources they point to.
 * A relationship whose target was not included stays a {@link ResourceStub}.
 */
export interface Resource extends ResourceBase {
  [field: string]: unknown;
}

/** A relationship target that was not part of `included`. */
export interface ResourceStub {
  id: string;
  type: string;
  relationshipMeta?: Meta;
  stub: true;
}

/** A to-one relationship: the included resource, a stub, or empty. */
export type ToOne<T> = T | ResourceStub | null;

/** A to-many relationship: included resources and stubs. */
export type ToMany<T> = Array<T | ResourceStub>;

export function isStub(value: unknown): value is ResourceStub {
  return typeof value === 'object' && value !== null && (value as ResourceStub).stub === true;
}

/**
 * The registry of resource types, keyed by JSON:API type name. Empty here;
 * packages and applications add to it by declaration merging:
 *
 * ```ts
 * declare module '@jsondrop/core' {
 *   interface ResourceTypes {
 *     'node--article': NodeArticle;
 *   }
 * }
 * ```
 *
 * Registered types make `client.getResource('node--article', id)` typed and
 * give their names autocompletion.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ResourceTypes {}

/**
 * Fallback shapes per entity type, keyed by entity type ID, for bundles
 * not registered in {@link ResourceTypes}. With `node: Node` registered,
 * `client.getResource('node--landing_page', id)` is a `Node` (plus
 * unknown extra fields) without registering every bundle.
 * `@jsondrop/drupal` registers Drupal core's entity types.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EntityTypes {}

/** A registered resource type name, or any other string. */
export type ResourceType = Extract<keyof ResourceTypes, string> | (string & {});

/**
 * The shape of a resource type: its {@link ResourceTypes} entry, else its
 * entity type's {@link EntityTypes} entry, else {@link Resource}.
 */
export type ResourceOf<T extends string> = T extends keyof ResourceTypes
  ? ResourceTypes[T]
  : T extends `${infer EntityType}--${string}`
    ? EntityType extends keyof EntityTypes ? EntityTypes[EntityType] & Resource : Resource
    : Resource;
