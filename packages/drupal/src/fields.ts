/**
 * Field value shapes, as Drupal 11's JSON:API normalizes core field types.
 *
 * Dates (`created`, `changed`, datetime fields) arrive as ISO 8601 strings.
 */

/** ISO 8601 date-time string, e.g. `2026-10-31T12:00:00+00:00`. */
export type DateTimeString = string;

/** `text_long`, `text_with_summary` (`summary` only on the latter). */
export interface TextField {
  value: string;
  format: string | null;
  /** The value rendered through its text format: safe HTML to output. */
  processed: string;
  summary?: string;
}

/** The `path` field (core path module). */
export interface PathField {
  alias: string | null;
  pid: number | null;
  langcode: string;
}

/** The `link` field type. */
export interface LinkField {
  /** `internal:/…`, `entity:node/1`, `route:<nolink>` or an external URL. */
  uri: string;
  title: string | null;
  options: Record<string, unknown>;
}

/** The file field's `uri`: the stream URI and its (root-relative) URL. */
export interface FileUri {
  value: string;
  url: string;
}

/**
 * Relationship meta of an `image` field item, found on the file resource
 * as `relationshipMeta`.
 */
export interface ImageMeta {
  alt: string;
  title: string;
  width: number | null;
  height: number | null;
  drupal_internal__target_id: number;
}

/** Relationship meta of a `file` field item. */
export interface FileMeta {
  display: boolean | null;
  description: string | null;
  drupal_internal__target_id: number;
}

/** `datetime_range` / `daterange`. */
export interface DateRangeField {
  value: DateTimeString;
  end_value: DateTimeString;
}

/** The `address` field (contrib address module, used by Commerce). */
export interface AddressField {
  country_code: string;
  langcode?: string | null;
  administrative_area?: string | null;
  locality?: string | null;
  dependent_locality?: string | null;
  postal_code?: string | null;
  sorting_code?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_line3?: string | null;
  organization?: string | null;
  given_name?: string | null;
  additional_name?: string | null;
  family_name?: string | null;
}
