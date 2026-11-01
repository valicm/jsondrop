import { isStub, type JsonApiClient } from '@jsondrop/core';
import type { File } from './entities.js';
import type { ImageMeta } from './fields.js';

/**
 * Absolute URL of a file. Drupal 11 serves `uri.url` root-relative
 * (`/sites/default/files/…`); this prefixes the site's origin.
 */
export function fileUrl(client: JsonApiClient, file: Pick<File, 'uri'>): string {
  const url = file.uri.url;
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') ? url : `${client.baseUrl}${url}`;
}

/**
 * URL of an image style derivative, as the consumer_image_styles module
 * adds them to the file's links. NULL when the style is not enabled for
 * the requesting consumer.
 */
export function imageStyleUrl(file: Pick<File, 'links'>, style: string): string | null {
  return file.links?.[style]?.href ?? null;
}

export interface Image {
  url: string;
  alt: string;
  title: string | null;
  width: number | null;
  height: number | null;
}

/**
 * An image field's value, ready for an `<img>`: absolute URL plus the alt
 * text and dimensions from the relationship. NULL for an empty field or a
 * file that was not included.
 */
export function image(client: JsonApiClient, value: unknown): Image | null {
  if (!value || typeof value !== 'object' || isStub(value)) {
    return null;
  }
  const file = value as File<ImageMeta>;
  if (!file.uri?.url) {
    return null;
  }
  const meta: Partial<ImageMeta> = file.relationshipMeta ?? {};
  return {
    url: fileUrl(client, file),
    alt: meta.alt ?? '',
    title: meta.title || null,
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}
