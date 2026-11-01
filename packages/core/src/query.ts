/**
 * Builds Drupal JSON:API query strings: include, sparse fieldsets, filters
 * (with groups), sorting and pagination.
 *
 * Drupal rejects unknown query parameters made only of a-z, because the
 * spec reserves them. Put custom parameters in `params` under a name that
 * contains another character (`_format`, `cart-token`).
 */

export type FilterValue = string | number | boolean;

export type FilterOperator =
  | '='
  | '<>'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'STARTS_WITH'
  | 'CONTAINS'
  | 'ENDS_WITH'
  | 'IN'
  | 'NOT IN'
  | 'BETWEEN'
  | 'NOT BETWEEN'
  | 'IS NULL'
  | 'IS NOT NULL';

export interface FilterCondition {
  /** Field path, e.g. `field_tags.name`. Defaults to the filter's key. */
  path?: string;
  operator?: FilterOperator;
  /** Omit for `IS NULL` / `IS NOT NULL`. */
  value?: FilterValue | FilterValue[];
  /** Name of the group this condition belongs to. */
  memberOf?: string;
}

export interface FilterGroup {
  conjunction: 'AND' | 'OR';
  /** Name of the parent group. */
  memberOf?: string;
}

export interface Query {
  include?: string[];
  /** Sparse fieldsets, keyed by resource type name. */
  fields?: Record<string, string[]>;
  /**
   * Keyed by a filter name. A bare value is shorthand for equality on the
   * field of that name: `{ status: 1 }`.
   */
  filter?: Record<string, FilterValue | FilterCondition>;
  /** Condition groups, keyed by group name; conditions join with `memberOf`. */
  groups?: Record<string, FilterGroup>;
  /** Field paths; prefix with `-` for descending. */
  sort?: string[];
  /** Drupal caps `limit` at 50 per page. */
  page?: { limit?: number; offset?: number };
  /** Anything else, appended verbatim. */
  params?: Record<string, string | string[]>;
}

/**
 * A query object, or an already-built query string (with or without the
 * leading `?`), e.g. from drupal-jsonapi-params.
 */
export type QueryInput = Query | string;

export function buildQueryString(query: QueryInput = {}): string {
  if (typeof query === 'string') {
    const string = query.replace(/^\?/, '');
    return string ? `?${string}` : '';
  }

  const search = new URLSearchParams();

  if (query.include?.length) {
    search.set('include', query.include.join(','));
  }
  for (const [type, names] of Object.entries(query.fields ?? {})) {
    search.set(`fields[${type}]`, names.join(','));
  }
  for (const [name, group] of Object.entries(query.groups ?? {})) {
    search.set(`filter[${name}][group][conjunction]`, group.conjunction);
    if (group.memberOf) {
      search.set(`filter[${name}][group][memberOf]`, group.memberOf);
    }
  }
  for (const [name, filter] of Object.entries(query.filter ?? {})) {
    if (typeof filter !== 'object') {
      search.set(`filter[${name}]`, String(filter));
      continue;
    }
    const prefix = `filter[${name}][condition]`;
    search.set(`${prefix}[path]`, filter.path ?? name);
    if (filter.operator) {
      search.set(`${prefix}[operator]`, filter.operator);
    }
    if (Array.isArray(filter.value)) {
      filter.value.forEach((value) => search.append(`${prefix}[value][]`, String(value)));
    }
    else if (filter.value !== undefined) {
      search.set(`${prefix}[value]`, String(filter.value));
    }
    if (filter.memberOf) {
      search.set(`${prefix}[memberOf]`, filter.memberOf);
    }
  }
  if (query.sort?.length) {
    search.set('sort', query.sort.join(','));
  }
  if (query.page?.limit !== undefined) {
    search.set('page[limit]', String(query.page.limit));
  }
  if (query.page?.offset !== undefined) {
    search.set('page[offset]', String(query.page.offset));
  }
  for (const [name, value] of Object.entries(query.params ?? {})) {
    (Array.isArray(value) ? value : [value]).forEach((item) => search.append(name, item));
  }

  const string = search.toString();
  return string ? `?${string}` : '';
}
