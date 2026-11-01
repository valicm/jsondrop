import { describe, expect, it } from 'vitest';
import { JsonApiClient, LoginRequiredError, OAuthClient, OAuthError, type OAuthTokens, type TokenStore } from '../src/index.js';
import { json, mockFetch, type RecordedCall } from './mock-fetch.js';

const BASE = 'https://cms.example.com';

function memoryStore(initial: OAuthTokens | null = null): TokenStore & { value: OAuthTokens | null } {
  const store = {
    value: initial,
    get: () => store.value,
    set: (tokens: OAuthTokens | null) => {
      store.value = tokens;
    },
  };
  return store;
}

const tokenResponse = (access: string, refresh: string, expiresIn = 300) => () =>
  new Response(JSON.stringify({ token_type: 'Bearer', access_token: access, refresh_token: refresh, expires_in: expiresIn }), { status: 200 });

const form = (call: RecordedCall) => Object.fromEntries(new URLSearchParams(String(call.init.body)));

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('OAuthClient login', () => {
  const oauth = (fetch?: typeof globalThis.fetch) =>
    new OAuthClient({ baseUrl: `${BASE}/`, clientId: 'web', redirectUri: 'https://app.example.com/auth/callback', scope: 'openid profile', fetch });

  it('starts a login with PKCE and a state', async () => {
    const login = await oauth().startLogin({ prompt: 'login' });
    const url = new URL(login.url);
    expect(`${url.origin}${url.pathname}`).toBe(`${BASE}/oauth/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'web',
      redirect_uri: 'https://app.example.com/auth/callback',
      state: login.state,
      code_challenge: await sha256(login.codeVerifier),
      code_challenge_method: 'S256',
      scope: 'openid profile',
      prompt: 'login',
    });
    expect(login.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect((await oauth().startLogin()).state).not.toBe(login.state);
  });

  it('exchanges the code, after checking the state', async () => {
    const { fetch, calls } = mockFetch(tokenResponse('a1', 'r1', 3600));
    const tokens = await oauth(fetch).finishLogin({ code: 'c1', state: 's1' }, { state: 's1', codeVerifier: 'v1' });

    expect(tokens).toMatchObject({ accessToken: 'a1', refreshToken: 'r1', idToken: null });
    expect(tokens.expiresAt).toBeGreaterThan(Date.now() + 3500_000);
    expect(calls[0]!.url).toBe(`${BASE}/oauth/token`);
    expect(form(calls[0]!)).toEqual({
      grant_type: 'authorization_code',
      code: 'c1',
      redirect_uri: 'https://app.example.com/auth/callback',
      code_verifier: 'v1',
      client_id: 'web',
    });
  });

  it('rejects a mismatched state, a missing code and a denied login', async () => {
    const { fetch, calls } = mockFetch(tokenResponse('a1', 'r1'));
    const client = oauth(fetch);
    await expect(client.finishLogin({ code: 'c1', state: 'other' }, { state: 's1', codeVerifier: 'v' })).rejects.toMatchObject({ error: 'invalid_state' });
    await expect(client.finishLogin({ state: 's1' }, { state: 's1', codeVerifier: 'v' })).rejects.toMatchObject({ error: 'invalid_request' });
    await expect(client.finishLogin({ error: 'access_denied', state: 's1' }, { state: 's1', codeVerifier: 'v' })).rejects.toMatchObject({ error: 'access_denied' });
    expect(calls).toHaveLength(0);
  });

  it('reads OpenID Connect user info', async () => {
    const { fetch, calls } = mockFetch(() => new Response(JSON.stringify({ sub: '7', name: 'ana' }), { status: 200 }));
    expect(await oauth(fetch).userInfo('a1')).toEqual({ sub: '7', name: 'ana' });
    expect(calls[0]!.url).toBe(`${BASE}/oauth/userinfo`);
    expect(calls[0]!.headers.get('Authorization')).toBe('Bearer a1');
  });
});

describe('OAuthClient as a client\'s auth', () => {
  const fresh = (access: string, refresh: string, inMs = 3600_000): OAuthTokens => ({ accessToken: access, refreshToken: refresh, expiresAt: Date.now() + inMs, scope: null, idToken: null });

  /** Drupal: a token endpoint that rotates refresh tokens, and an API accepting only `valid` access tokens. */
  function drupal(valid: Set<string>) {
    let issued = 0;
    return mockFetch((call) => {
      if (call.url.endsWith('/oauth/token')) {
        const refresh = form(call).refresh_token;
        if (refresh === 'revoked') return new Response('{"error":"invalid_grant","error_description":"The refresh token is invalid."}', { status: 400 });
        issued++;
        valid.add(`a${issued + 1}`);
        return tokenResponse(`a${issued + 1}`, `r${issued + 1}`)();
      }
      const token = call.headers.get('Authorization')?.replace('Bearer ', '');
      return token && valid.has(token) ? json({ data: null })(call) : json({ errors: [{ status: '401', detail: 'Unauthorized' }] }, 401)(call);
    });
  }

  it('sends the stored token, and goes anonymous without one', async () => {
    const { fetch, calls } = drupal(new Set(['a1']));
    const oauth = new OAuthClient({ baseUrl: BASE, clientId: 'web', redirectUri: 'x', fetch });
    await new JsonApiClient({ baseUrl: BASE, fetch, auth: oauth.strategy(memoryStore(fresh('a1', 'r1'))) }).get('/x');
    await new JsonApiClient({ baseUrl: BASE, fetch, auth: oauth.strategy(memoryStore()) }).get('/x').catch(() => {});
    expect(calls.map((call) => call.headers.get('Authorization'))).toEqual(['Bearer a1', null]);
  });

  it('refreshes an expiring token once for concurrent requests, and stores the new tokens', async () => {
    const { fetch, calls } = drupal(new Set());
    const store = memoryStore(fresh('a1', 'r1', 10_000));
    const oauth = new OAuthClient({ baseUrl: BASE, clientId: 'web', clientSecret: 'secret', redirectUri: 'x', fetch });
    const api = new JsonApiClient({ baseUrl: BASE, fetch, auth: oauth.strategy(store) });

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    const refreshes = calls.filter((call) => call.url.endsWith('/oauth/token'));
    expect(refreshes).toHaveLength(1);
    expect(form(refreshes[0]!)).toEqual({ grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'web', client_secret: 'secret' });
    expect(store.value).toMatchObject({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('renews and retries once after a 401', async () => {
    const { fetch, calls } = drupal(new Set());
    const store = memoryStore(fresh('revoked-access', 'r1'));
    const oauth = new OAuthClient({ baseUrl: BASE, clientId: 'web', redirectUri: 'x', fetch });
    const response = await new JsonApiClient({ baseUrl: BASE, fetch, auth: oauth.strategy(store) }).get('/x');

    expect(response.status).toBe(200);
    expect(calls.map((call) => (call.url.endsWith('/oauth/token') ? 'refresh' : call.headers.get('Authorization')))).toEqual(['Bearer revoked-access', 'refresh', 'Bearer a2']);
  });

  it('logs the user out when the refresh token is rejected', async () => {
    const { fetch } = drupal(new Set());
    const store = memoryStore(fresh('a1', 'revoked', -1));
    const oauth = new OAuthClient({ baseUrl: BASE, clientId: 'web', redirectUri: 'x', fetch });
    const error = await new JsonApiClient({ baseUrl: BASE, fetch, auth: oauth.strategy(store) }).get('/x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LoginRequiredError);
    expect((error as LoginRequiredError).cause).toBeInstanceOf(OAuthError);
    expect(((error as LoginRequiredError).cause as OAuthError).error).toBe('invalid_grant');
    expect(store.value).toBeNull();
  });
});
