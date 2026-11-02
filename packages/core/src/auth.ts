/**
 * Authentication strategies. A strategy returns the headers that
 * authenticate one request; the client calls it before every request.
 *
 * A strategy may also implement `invalidate()`. When a request comes back
 * 401, the client calls it and retries once, so cached tokens that Drupal
 * has revoked are replaced transparently.
 */

export interface AuthContext {
  /** Site origin the client talks to, without a trailing slash. */
  baseUrl: string;
  fetch: typeof fetch;
}

export interface AuthStrategy {
  headers(context: AuthContext): HeadersInit | undefined | Promise<HeadersInit | undefined>;
  /**
   * Called after a 401: drop cached credentials, so the retry gets fresh
   * ones. Return `false` when there is nothing to renew, to skip the retry.
   */
  invalidate?(): void | boolean;
}

type Value = string | null | undefined;
type ValueSource = Value | (() => Value | Promise<Value>);

async function value(source: ValueSource): Promise<Value> {
  return typeof source === 'function' ? source() : source;
}

/** `Authorization: Bearer <token>`, from a token or a function that returns one. */
export function bearer(token: ValueSource): AuthStrategy {
  return {
    async headers() {
      const resolved = await value(token);
      return resolved ? { Authorization: `Bearer ${resolved}` } : undefined;
    },
  };
}

/** HTTP Basic authentication (Drupal core's `basic_auth` module). */
export function basic(username: string, password: string): AuthStrategy {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  const encoded = btoa(String.fromCharCode(...bytes));
  return { headers: () => ({ Authorization: `Basic ${encoded}` }) };
}

/**
 * Forwards a Drupal session cookie (`SSESS…=value`), e.g. one a server-side
 * login obtained and the application keeps in its own httpOnly cookie.
 */
export function sessionCookie(cookie: ValueSource): AuthStrategy {
  return {
    async headers() {
      const resolved = await value(cookie);
      return resolved ? { Cookie: resolved } : undefined;
    },
  };
}

export interface ClientCredentialsOptions {
  clientId: string;
  clientSecret: string;
  /** Space-separated scopes. */
  scope?: string;
  /** Token endpoint path or absolute URL. Default `/oauth/token` (simple_oauth). */
  tokenUrl?: string;
  /** Renew this many milliseconds before expiry. Default 30 seconds. */
  renewBeforeMs?: number;
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  /** With the `openid` scope (simple_oauth's OpenID Connect). */
  id_token?: string;
}

export class OAuthError extends Error {
  override readonly name = 'OAuthError';
  /** The OAuth error code, e.g. `invalid_grant` (expired or reused refresh token), `invalid_client`. */
  readonly error: string | null;

  constructor(readonly status: number, readonly body: string) {
    super(`OAuth token request failed: HTTP ${status}${body ? ` ${body}` : ''}`);
    let error: string | null = null;
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      error = typeof parsed.error === 'string' ? parsed.error : null;
    }
    catch {
      // Not JSON.
    }
    this.error = error;
  }
}

/** POSTs a token request (form-encoded) and returns the token response. */
export async function requestToken(context: AuthContext, tokenUrl: string, params: Record<string, string | undefined>): Promise<TokenResponse> {
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') body.set(name, value);
  }
  const response = await context.fetch(absolute(context.baseUrl, tokenUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!response.ok) {
    throw new OAuthError(response.status, await response.text());
  }
  return (await response.json()) as TokenResponse;
}

/** An absolute URL for a site path, or the URL itself. */
export function absolute(baseUrl: string, pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
}

/**
 * OAuth 2 client credentials (simple_oauth), for server-to-server requests.
 * The token is cached in this strategy until shortly before it expires, and
 * concurrent requests share one token request. Never use it in a browser:
 * it needs the client secret.
 */
export function clientCredentials(options: ClientCredentialsOptions): AuthStrategy & { token(context: AuthContext): Promise<string> } {
  const renewBeforeMs = options.renewBeforeMs ?? 30_000;
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  const request = async (context: AuthContext): Promise<string> => {
    const token = await requestToken(context, options.tokenUrl ?? '/oauth/token', {
      grant_type: 'client_credentials',
      client_id: options.clientId,
      client_secret: options.clientSecret,
      scope: options.scope,
    });
    cached = {
      token: token.access_token,
      expiresAt: token.expires_in === undefined ? Number.POSITIVE_INFINITY : performance.now() + token.expires_in * 1000,
    };
    return cached.token;
  };

  const strategy = {
    async token(context: AuthContext): Promise<string> {
      // Not `Date.now()`: Next.js fails prerendering on it under Cache Components.
      if (cached && cached.expiresAt - renewBeforeMs > performance.now()) {
        return cached.token;
      }
      pending ??= request(context).finally(() => {
        pending = null;
      });
      return pending;
    },
    async headers(context: AuthContext) {
      return { Authorization: `Bearer ${await strategy.token(context)}` };
    },
    invalidate() {
      cached = null;
    },
  };
  return strategy;
}
