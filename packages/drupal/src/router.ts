import { isJsonApiError, type JsonApiClient, type Resource, type ResourceRequestOptions } from '@jsondrop/core';

/** What decoupled_router answers for a path. */
export interface TranslatedPath {
  /** Absolute URL the path resolves to. */
  resolved: string;
  isHomePath: boolean;
  entity?: {
    canonical: string;
    type: string;
    bundle: string;
    /** Drupal's numeric ID, as a string. */
    id: string;
    uuid: string;
  };
  label?: string;
  /** Present when the path is an entity JSON:API exposes. */
  jsonapi?: {
    individual: string;
    resourceName: string;
    pathPrefix: string;
    basePath: string;
    entryPoint: string;
  };
  /** Redirects (redirect module) that led here, oldest first. */
  redirect?: Array<{ from: string; to: string; status: string }>;
  [key: string]: unknown;
}

export interface ResolvedPath<T> {
  route: TranslatedPath;
  /** The entity at the path; NULL when the path is not a JSON:API entity. */
  resource: T | null;
}

type PathOptions = Pick<ResourceRequestOptions, 'locale' | 'auth' | 'headers' | 'fetchOptions' | 'signal'>;

/**
 * Resolves a site path (`/about-us`, `/node/1`) with the decoupled_router
 * module. NULL when nothing is there; a 403 (unpublished, no access) throws.
 */
export async function translatePath(client: JsonApiClient, path: string, options: PathOptions = {}): Promise<TranslatedPath | null> {
  try {
    const response = await client.get(client.siteUrl('/router/translate-path', undefined, options.locale), {
      ...options,
      query: { params: { path, _format: 'json' } },
      headers: { Accept: 'application/json', ...headersObject(options.headers) },
    });
    return response.document as unknown as TranslatedPath;
  }
  catch (error) {
    if (isJsonApiError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Resolves a path and fetches the entity there, in two requests. The entity
 * is fetched from the URL decoupled_router gives, which respects resource
 * paths renamed with JSON:API Extras and the path's language.
 *
 * ```ts
 * const page = await getResourceByPath<Node>(drupal, params.slug, { query: { include: ['uid'] } });
 * if (!page) notFound();
 * if (page.route.redirect?.length) redirect(page.route.redirect.at(-1)!.to);
 * ```
 */
export async function getResourceByPath<T = Resource>(client: JsonApiClient, path: string, options: ResourceRequestOptions = {}): Promise<ResolvedPath<T> | null> {
  const route = await translatePath(client, path, options);
  if (!route) {
    return null;
  }
  if (!route.jsonapi?.individual) {
    return { route, resource: null };
  }
  const response = await client.get<T>(route.jsonapi.individual, options);
  return { route, resource: response.data };
}

function headersObject(headers: HeadersInit | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, name) => {
    result[name] = value;
  });
  return result;
}
