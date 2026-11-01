import { sessionCookie, type JsonApiClient, type ResourceRequestOptions } from '@jsondrop/core';
import type { User } from './entities.js';

/**
 * The current user, from Drupal core alone: an authenticated request to the
 * JSON:API entry point carries `meta.links.me` with the user's UUID. Works
 * with any auth (OAuth bearer token, session cookie). NULL when anonymous.
 *
 * Two requests: the entry point, then the user (with `options`).
 */
export async function getCurrentUser<T = User>(client: JsonApiClient, options: ResourceRequestOptions = {}): Promise<T | null> {
  const id = await getCurrentUserId(client, options);
  return id ? client.getResource('user--user', id, options) as Promise<T> : null;
}

/** The current user's UUID, or NULL when anonymous (one request). */
export async function getCurrentUserId(client: JsonApiClient, options: Pick<ResourceRequestOptions, 'auth' | 'headers' | 'fetchOptions' | 'signal'> = {}): Promise<string | null> {
  const { auth, headers, fetchOptions, signal } = options;
  const response = await client.request('GET', '', { auth, headers, fetchOptions, signal });
  const me = (response.meta.links as { me?: { meta?: { id?: string } } } | undefined)?.me;
  return me?.meta?.id ?? null;
}

/**
 * Cookie session login through Drupal core's `/user/login?_format=json`,
 * for sites without simple_oauth. Server-side only: it reads the session
 * cookie from `Set-Cookie`, which browsers hide from scripts.
 *
 * Keep `cookie` in an httpOnly cookie of your app (never hand Drupal's own
 * cookie to the browser) and send it with `sessionCookie(cookie)` as auth.
 * Keep `logoutToken` too: logging out needs it.
 */
export interface SessionLogin {
  /** The session cookie as a `Cookie` header value (`SSESS…=…`). */
  cookie: string;
  /** The user as Drupal reports them; fields the user cannot view are absent. */
  user: { uid?: string; name?: string; roles?: string[] };
  /** For requests that need Drupal's CSRF token (`X-CSRF-Token`), e.g. core REST writes. */
  csrfToken: string;
  /** Pass to {@link logout}. */
  logoutToken: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

/**
 * Logs in with a username and password. Wrong credentials and blocked
 * accounts throw a 400; too many attempts (flood control) a 403 or 429.
 * The error's `message` is Drupal's explanation.
 */
export async function login(client: JsonApiClient, credentials: { name: string; pass: string }): Promise<SessionLogin> {
  const response = await client.post<{ current_user?: SessionLogin['user']; csrf_token?: string; logout_token?: string } | null>(client.siteUrl('/user/login'), credentials, {
    auth: false,
    query: { params: { _format: 'json' } },
    headers: JSON_HEADERS,
    parse: 'json',
  });
  const body = response.data ?? {};
  const cookie = sessionCookieOf(response.headers);
  if (!cookie) {
    throw new Error('Drupal answered the login without a session cookie. Log in from the server, not the browser.');
  }
  return { cookie, user: body.current_user ?? {}, csrfToken: body.csrf_token ?? '', logoutToken: body.logout_token ?? '' };
}

/** Ends the Drupal session (`/user/logout`, with the logout token from {@link login}). */
export async function logout(client: JsonApiClient, session: Pick<SessionLogin, 'cookie' | 'logoutToken'>): Promise<void> {
  await client.post(client.siteUrl('/user/logout'), undefined, {
    auth: sessionCookie(session.cookie),
    query: { params: { _format: 'json', token: session.logoutToken } },
    headers: JSON_HEADERS,
    parse: 'json',
  });
}

/** Whether the session is still logged in (`/user/login_status`). */
export async function isLoggedIn(client: JsonApiClient, cookie: string): Promise<boolean> {
  const response = await client.get<number | string | null>(client.siteUrl('/user/login_status'), {
    auth: sessionCookie(cookie),
    query: { params: { _format: 'json' } },
    headers: JSON_HEADERS,
    parse: 'json',
  });
  // Drupal answers a bare `1` or `0`.
  return Number(response.data) === 1;
}

/**
 * A CSRF token (`/session/token`), for the `X-CSRF-Token` header that
 * Drupal requires on writes to core REST resources (webform_rest, for
 * one) when a session cookie authenticates them. Requests with a bearer
 * token, or anonymous ones, do not need it.
 */
export async function getCsrfToken(client: JsonApiClient, cookie?: string): Promise<string> {
  const response = await client.get<string>(client.siteUrl('/session/token'), {
    auth: cookie ? sessionCookie(cookie) : false,
    headers: { Accept: 'text/plain' },
    parse: 'text',
  });
  return response.data.trim();
}

/**
 * Mails a password reset link (`/user/password`). Answers the same whether
 * or not the account exists, so it does not reveal accounts.
 */
export async function requestPasswordReset(client: JsonApiClient, account: { name: string } | { mail: string }): Promise<void> {
  await client.post(client.siteUrl('/user/password'), account, {
    auth: false,
    query: { params: { _format: 'json' } },
    headers: JSON_HEADERS,
    parse: 'json',
  });
}

/** Drupal's session cookie(s) from a response, as a `Cookie` header value. */
function sessionCookieOf(headers: Headers): string | null {
  const setCookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') ?? '').split(/,(?=\s*[^;,]+=)/);
  const pairs = setCookies
    .map((line) => line.split(';')[0]?.trim() ?? '')
    .filter((pair) => /^S?SESS[^=]*=./.test(pair));
  return pairs.length ? pairs.join('; ') : null;
}
