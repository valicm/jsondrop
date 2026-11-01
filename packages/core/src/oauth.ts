import { absolute, OAuthError, requestToken, type AuthContext, type AuthStrategy, type TokenResponse } from './auth.js';

/**
 * Logging users in with OAuth 2: the authorization code grant with PKCE and
 * refresh tokens, as simple_oauth 6.x serves it (`/oauth/authorize`,
 * `/oauth/token`, `/oauth/userinfo`). simple_oauth 6 dropped the password
 * and implicit grants; this is the flow it supports for users.
 *
 * 1. `startLogin()` gives the URL to send the user to, plus a `state` and
 *    PKCE `codeVerifier` to keep (an httpOnly cookie) until they return.
 * 2. Drupal sends them back to `redirectUri` with `code` and `state`;
 *    `finishLogin()` checks the state and exchanges the code for tokens.
 * 3. Store the tokens server-side and use `strategy(store)` as the client's
 *    auth: it refreshes before expiry and once after a 401.
 *
 * One `OAuthClient` per app (not per request): it deduplicates refreshes.
 */

export interface OAuthClientOptions {
  /** Site origin, e.g. `https://cms.example.com`. */
  baseUrl: string;
  clientId: string;
  /**
   * For confidential clients (a server). Leave out for public clients;
   * PKCE protects the code exchange either way.
   */
  clientSecret?: string;
  /** Where Drupal sends the user back; must match the consumer's redirect URI. */
  redirectUri: string;
  /** Space-separated scopes. Add `openid` for OpenID Connect (ID token, userinfo). */
  scope?: string;
  /** Paths or absolute URLs. Defaults are simple_oauth's. */
  authorizeUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  /** Renew this many milliseconds before expiry. Default 60 seconds. */
  renewBeforeMs?: number;
  fetch?: typeof fetch;
}

/** A user's tokens, as stored between requests. */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds. */
  expiresAt: number;
  scope: string | null;
  idToken: string | null;
}

/** Where a user's tokens live between requests: their session, an httpOnly cookie, Redis… */
export interface TokenStore {
  get(): OAuthTokens | null | undefined | Promise<OAuthTokens | null | undefined>;
  /** NULL logs the user out (the refresh token was rejected). */
  set(tokens: OAuthTokens | null): void | Promise<void>;
}

/** What to keep until the user comes back from Drupal. */
export interface LoginRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

/** The user's session ended: their refresh token was rejected or missing. Log in again. */
export class LoginRequiredError extends Error {
  override readonly name = 'LoginRequiredError';

  constructor(override readonly cause?: unknown) {
    super('The user must log in again.');
  }
}

export class OAuthClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  /** Refreshes in flight, by refresh token: simple_oauth's refresh tokens are single-use. */
  private readonly refreshing = new Map<string, Promise<OAuthTokens>>();

  constructor(readonly options: OAuthClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  /** Step 1: the authorization URL, and the state and verifier to keep. */
  async startLogin(extra: Record<string, string> = {}): Promise<LoginRequest> {
    const state = randomString(32);
    const codeVerifier = randomString(64);
    const url = new URL(absolute(this.baseUrl, this.options.authorizeUrl ?? '/oauth/authorize'));
    const params: Record<string, string> = {
      response_type: 'code',
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      state,
      code_challenge: await sha256Base64Url(codeVerifier),
      code_challenge_method: 'S256',
      ...(this.options.scope ? { scope: this.options.scope } : {}),
      ...extra,
    };
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    return { url: url.toString(), state, codeVerifier };
  }

  /**
   * Step 2: the redirect's query (`code`, `state`, or `error`), checked
   * against what `startLogin()` returned, exchanged for tokens.
   */
  async finishLogin(callback: { code?: string | null; state?: string | null; error?: string | null; error_description?: string | null }, expected: { state: string; codeVerifier: string }): Promise<OAuthTokens> {
    if (callback.error) {
      throw new OAuthError(400, JSON.stringify({ error: callback.error, error_description: callback.error_description ?? undefined }));
    }
    if (!callback.state || !timingSafeEqual(callback.state, expected.state)) {
      throw new OAuthError(400, JSON.stringify({ error: 'invalid_state', error_description: 'The state does not match the login request.' }));
    }
    if (!callback.code) {
      throw new OAuthError(400, JSON.stringify({ error: 'invalid_request', error_description: 'No authorization code.' }));
    }
    return tokens(await requestToken(this.context(), this.tokenUrl(), {
      grant_type: 'authorization_code',
      code: callback.code,
      redirect_uri: this.options.redirectUri,
      code_verifier: expected.codeVerifier,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
    }));
  }

  /**
   * New tokens for a refresh token. The refresh token is single-use:
   * concurrent calls with the same one share a request.
   */
  refresh(refreshToken: string): Promise<OAuthTokens> {
    let pending = this.refreshing.get(refreshToken);
    if (!pending) {
      pending = requestToken(this.context(), this.tokenUrl(), {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        scope: this.options.scope,
      })
        .then((response) => tokens(response, refreshToken))
        .finally(() => this.refreshing.delete(refreshToken));
      this.refreshing.set(refreshToken, pending);
    }
    return pending;
  }

  /** OpenID Connect claims of the token's user (needs the `openid` scope). */
  async userInfo(accessToken: string): Promise<Record<string, unknown> & { sub: string }> {
    const response = await this.fetchImpl(absolute(this.baseUrl, this.options.userInfoUrl ?? '/oauth/userinfo'), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new OAuthError(response.status, await response.text());
    }
    return (await response.json()) as Record<string, unknown> & { sub: string };
  }

  /**
   * The user's access token from `store`, renewed with the refresh token
   * before it expires. Throws {@link LoginRequiredError} (and empties the
   * store) when the session cannot be renewed.
   */
  async accessToken(store: TokenStore, force = false): Promise<string | null> {
    const current = await store.get();
    if (!current) {
      return null;
    }
    const renewBeforeMs = this.options.renewBeforeMs ?? 60_000;
    if (!force && current.expiresAt - renewBeforeMs > Date.now()) {
      return current.accessToken;
    }
    if (!current.refreshToken) {
      await store.set(null);
      throw new LoginRequiredError();
    }
    try {
      const renewed = await this.refresh(current.refreshToken);
      await store.set(renewed);
      return renewed.accessToken;
    }
    catch (error) {
      if (error instanceof OAuthError && error.status >= 400 && error.status < 500) {
        await store.set(null);
        throw new LoginRequiredError(error);
      }
      throw error;
    }
  }

  /**
   * An auth strategy for a user's requests. Without stored tokens, requests
   * go anonymously. After a 401, the next attempt renews the token first.
   */
  strategy(store: TokenStore): AuthStrategy {
    let force = false;
    let sentToken = false;
    return {
      headers: async () => {
        const token = await this.accessToken(store, force);
        force = false;
        sentToken = token !== null;
        return token ? { Authorization: `Bearer ${token}` } : undefined;
      },
      // Nothing to renew for an anonymous request: no retry.
      invalidate: () => {
        force = sentToken;
        return sentToken;
      },
    };
  }

  private tokenUrl(): string {
    return this.options.tokenUrl ?? '/oauth/token';
  }

  private context(): AuthContext {
    return { baseUrl: this.baseUrl, fetch: this.fetchImpl };
  }
}

function tokens(response: TokenResponse, previousRefreshToken: string | null = null): OAuthTokens {
  return {
    accessToken: response.access_token,
    // A server that does not rotate refresh tokens leaves it out; keep the old one.
    refreshToken: response.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + (response.expires_in ?? 300) * 1000,
    scope: response.scope ?? null,
    idToken: response.id_token ?? null,
  };
}

function randomString(bytes: number): string {
  return base64Url(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
