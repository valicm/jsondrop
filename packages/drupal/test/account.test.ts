import { isJsonApiError, JsonApiClient, sessionCookie } from '@jsondrop/core';
import { describe, expect, it } from 'vitest';
import { getCurrentUser, getCurrentUserId, isLoggedIn, login, logout, requestPasswordReset } from '../src/index.js';
import { json, mockFetch } from '../../core/test/mock-fetch.js';

const BASE = 'https://cms.example.com';
const client = (fetch: typeof globalThis.fetch) => new JsonApiClient({ baseUrl: BASE, fetch });

describe('current user', () => {
  it('finds the user from the entry point\'s me link', async () => {
    const { fetch, calls } = mockFetch(
      json({ data: [], meta: { links: { me: { meta: { id: 'u1' }, href: `${BASE}/jsonapi/user/user/u1` } } }, links: {} }),
      json({ data: { type: 'user--user', id: 'u1', attributes: { display_name: 'Ana', drupal_internal__uid: 7, langcode: 'en' } } }),
    );
    const user = await getCurrentUser(client(fetch), { auth: sessionCookie('SSESSabc=1') });
    expect(user?.display_name).toBe('Ana');
    expect(calls.map((call) => call.url)).toEqual([`${BASE}/jsonapi`, `${BASE}/jsonapi/user/user/u1`]);
    expect(calls.every((call) => call.headers.get('Cookie') === 'SSESSabc=1')).toBe(true);
  });

  it('is null when anonymous', async () => {
    const { fetch, calls } = mockFetch(json({ data: [], links: {} }));
    expect(await getCurrentUser(client(fetch))).toBeNull();
    expect(await getCurrentUserId(client(fetch))).toBeNull();
    expect(calls).toHaveLength(2);
  });
});

describe('session login', () => {
  const loggedIn = () => new Response(
    JSON.stringify({ current_user: { uid: '7', roles: ['authenticated'], name: 'ana' }, csrf_token: 'csrf', logout_token: 'lt' }),
    { status: 200, headers: [['Content-Type', 'application/json'], ['Set-Cookie', 'SSESSabc123=sessionvalue; expires=Wed, 01 Dec 2026 00:00:00 GMT; path=/; secure; HttpOnly; SameSite=Lax'], ['Set-Cookie', 'other=1; path=/']] },
  );

  it('logs in and keeps the session cookie', async () => {
    const { fetch, calls } = mockFetch(loggedIn);
    const session = await login(client(fetch), { name: 'ana', pass: 'secret' });

    expect(session).toEqual({ cookie: 'SSESSabc123=sessionvalue', user: { uid: '7', roles: ['authenticated'], name: 'ana' }, csrfToken: 'csrf', logoutToken: 'lt' });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${BASE}/user/login?_format=json`);
    expect(calls[0]!.headers.get('Content-Type')).toBe('application/json');
    expect(calls[0]!.body).toEqual({ name: 'ana', pass: 'secret' });
  });

  it('reports Drupal\'s message for bad credentials', async () => {
    const { fetch } = mockFetch(() => new Response(JSON.stringify({ message: 'Unrecognized username or password.' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    const error = await login(client(fetch), { name: 'ana', pass: 'wrong' }).catch((caught: unknown) => caught);
    expect(isJsonApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 400, message: 'Unrecognized username or password.' });
  });

  it('logs out with the logout token', async () => {
    const { fetch, calls } = mockFetch(() => new Response(null, { status: 204 }));
    await logout(client(fetch), { cookie: 'SSESSabc123=v', logoutToken: 'lt' });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${BASE}/user/logout?_format=json&token=lt`);
    expect(calls[0]!.headers.get('Cookie')).toBe('SSESSabc123=v');
  });

  it('checks the login status', async () => {
    const { fetch } = mockFetch(() => new Response('1', { status: 200 }), () => new Response('0', { status: 200 }));
    expect(await isLoggedIn(client(fetch), 'SSESSabc=1')).toBe(true);
    expect(await isLoggedIn(client(fetch), 'SSESSabc=1')).toBe(false);
  });

  it('requests a password reset', async () => {
    const { fetch, calls } = mockFetch(() => new Response(null, { status: 200 }));
    await requestPasswordReset(client(fetch), { mail: 'ana@example.com' });
    expect(calls[0]!.url).toBe(`${BASE}/user/password?_format=json`);
    expect(calls[0]!.body).toEqual({ mail: 'ana@example.com' });
  });
});
