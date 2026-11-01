import type { Document, Resource, ResourceIdentifier, ResourceObject, ResourceStub } from './types.js';

/**
 * Turns a JSON:API document's primary data into {@link Resource} objects.
 *
 * Attributes and relationships are flattened onto the resource, and each
 * relationship is replaced by the included resource it points to, resolved
 * recursively, so `article.field_image.uri.url` works without walking
 * `included` by hand. Targets that were not included become
 * {@link ResourceStub}s. Cycles (a variation pointing back at its product)
 * are cut by resolving each resource once and sharing the object.
 *
 * A relationship with only links (not loaded) is left off the resource.
 */
export function deserialize(document: Document): Resource | Resource[] | null {
  const data = document.data;
  if (data === undefined || data === null) {
    return null;
  }

  const index = new Map<string, ResourceObject>();
  for (const object of [...(document.included ?? []), ...(Array.isArray(data) ? data : [data])]) {
    index.set(key(object), object);
  }
  const resolved = new Map<string, Resource>();

  const resolve = (object: ResourceObject): Resource => {
    const existing = resolved.get(key(object));
    if (existing) {
      return existing;
    }
    const resource: Resource = { ...(object.attributes ?? {}), id: object.id, type: object.type };
    if (object.meta) resource.meta = object.meta;
    if (object.links) resource.links = object.links;
    // Registered before its relationships, so a cycle finds it.
    resolved.set(key(object), resource);

    for (const [name, relationship] of Object.entries(object.relationships ?? {})) {
      const target = relationship.data;
      if (target === undefined) {
        continue;
      }
      resource[name] = Array.isArray(target)
        ? target.map((identifier) => link(identifier))
        : target === null ? null : link(target);
    }
    return resource;
  };

  const link = (identifier: ResourceIdentifier): Resource | ResourceStub => {
    const object = index.get(key(identifier));
    if (!object) {
      const stub: ResourceStub = { id: identifier.id, type: identifier.type, stub: true };
      if (identifier.meta) stub.relationshipMeta = identifier.meta;
      return stub;
    }
    const target = resolve(object);
    // The identifier's meta belongs to this relationship, not the resource,
    // so it goes on a shallow copy.
    return identifier.meta ? { ...target, relationshipMeta: identifier.meta } : target;
  };

  return Array.isArray(data) ? data.map(resolve) : resolve(data);
}

function key(identifier: { type: string; id: string }): string {
  return `${identifier.type}:${identifier.id}`;
}
