import type { JsonApiClient, Links, Meta, Resource, ResourceRequestOptions } from '@jsondrop/core';

export interface ViewOptions extends Omit<ResourceRequestOptions, 'query'> {
  /** Exposed filters, by identifier. */
  filters?: Record<string, string | string[]>;
  /** Contextual filter values, in order. */
  arguments?: string[];
  /** Exposed sort. */
  sort?: { by: string; order?: 'ASC' | 'DESC' };
  /** Zero-based page of the view's pager. */
  page?: number;
  /** Other parameters (`include` works). */
  params?: Record<string, string | string[]>;
}

export interface ViewResult<T> {
  data: T[];
  /** Total result count, when the view has a pager. */
  count: number | null;
  meta: Meta;
  links: Links;
}

/**
 * Results of a view display (jsonapi_views module): the display's
 * filters, sorts and pager, as JSON:API resources.
 */
export async function getView<T = Resource>(client: JsonApiClient, view: string, display: string, options: ViewOptions = {}): Promise<ViewResult<T>> {
  const { filters, arguments: args, sort, page, params, ...rest } = options;
  const query: Record<string, string | string[]> = { ...params };
  for (const [name, value] of Object.entries(filters ?? {})) {
    if (Array.isArray(value)) query[`views-filter[${name}][]`] = value;
    else query[`views-filter[${name}]`] = value;
  }
  if (args?.length) query['views-argument[]'] = args;
  if (sort) {
    query['views-sort[sort_by]'] = sort.by;
    if (sort.order) query['views-sort[sort_order]'] = sort.order;
  }
  if (page !== undefined) query.page = String(page);

  const response = await client.get<T[]>(`/views/${encodeURIComponent(view)}/${encodeURIComponent(display)}`, { ...rest, query: { params: query } });
  const count = response.meta.count;
  return {
    data: response.data ?? [],
    count: count === undefined || count === null ? null : Number(count),
    meta: response.meta,
    links: response.links,
  };
}
