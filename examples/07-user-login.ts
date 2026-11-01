/**
 * Example 7: logging users in.
 *
 * Two ways, both server-side, both keeping Drupal's credentials out of the
 * browser (httpOnly cookies of your app hold them):
 *
 * A. OAuth (simple_oauth 6.x): authorization code + PKCE, refresh tokens.
 *    The user logs in on Drupal's own login page. Preferred.
 * B. Drupal session (core `/user/login`): your own login form posts the
 *    username and password to your server, which logs in to Drupal.
 *
 * `CookieStore` is the framework's cookie jar (Next: `await cookies()`).
 */
import { JsonApiClient, LoginRequiredError, OAuthClient, sessionCookie, type OAuthTokens, type TokenStore } from '@jsondrop/core';
import { getCurrentUser, login, logout, type User } from '@jsondrop/drupal';
import type { CookieStore } from './06-server-cart-token.js';

const DRUPAL_URL = process.env.DRUPAL_URL ?? 'https://cms.example.com';
const cookieOptions = { httpOnly: true, sameSite: 'lax', path: '/', secure: true } as const;

export const drupal = new JsonApiClient({ baseUrl: DRUPAL_URL, fetchOptions: { cache: 'no-store' } });

// A. OAuth --------------------------------------------------------------

/** One per app: it deduplicates refreshes (refresh tokens are single-use). */
export const oauth = new OAuthClient({
  baseUrl: DRUPAL_URL,
  clientId: process.env.DRUPAL_CLIENT_ID ?? 'web',
  // A server is a confidential client; PKCE is used either way.
  clientSecret: process.env.DRUPAL_CLIENT_SECRET,
  redirectUri: 'https://app.example.com/auth/callback',
  scope: 'openid profile',
});

const LOGIN_COOKIE = 'oauth_login';
const TOKENS_COOKIE = 'oauth_tokens';

/**
 * Tokens in an httpOnly cookie. Fine for a demo; in production prefer a
 * server-side session store keyed by a session ID cookie, or encrypt the
 * cookie: refresh tokens are long-lived credentials.
 */
export function cookieTokenStore(cookies: CookieStore): TokenStore {
  return {
    get: () => {
      const raw = cookies.get(TOKENS_COOKIE)?.value;
      return raw ? (JSON.parse(raw) as OAuthTokens) : null;
    },
    set: (tokens) => {
      if (tokens) cookies.set(TOKENS_COOKIE, JSON.stringify(tokens), { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 });
      else cookies.delete(TOKENS_COOKIE);
    },
  };
}

/** GET /auth/login: redirect to Drupal's login. */
export async function startOAuthLogin(cookies: CookieStore): Promise<string> {
  const { url, state, codeVerifier } = await oauth.startLogin();
  cookies.set(LOGIN_COOKIE, JSON.stringify({ state, codeVerifier }), { ...cookieOptions, maxAge: 600 });
  return url;
}

/** GET /auth/callback?code=…&state=…: finish the login, then redirect home. */
export async function finishOAuthLogin(cookies: CookieStore, query: URLSearchParams): Promise<void> {
  const pending = cookies.get(LOGIN_COOKIE)?.value;
  cookies.delete(LOGIN_COOKIE);
  if (!pending) throw new Error('No login in progress');
  const tokens = await oauth.finishLogin(
    { code: query.get('code'), state: query.get('state'), error: query.get('error') },
    JSON.parse(pending) as { state: string; codeVerifier: string },
  );
  await cookieTokenStore(cookies).set(tokens);
}

/** A client acting as the logged-in user (anonymous when nobody is). */
export function userClient(cookies: CookieStore): JsonApiClient {
  return drupal.extend({ auth: oauth.strategy(cookieTokenStore(cookies)) });
}

/** The user for the page header; NULL when logged out or the session ended. */
export async function currentUser(cookies: CookieStore): Promise<User | null> {
  try {
    return await getCurrentUser(userClient(cookies));
  }
  catch (error) {
    // The refresh token was rejected: the store is already empty.
    if (error instanceof LoginRequiredError) return null;
    throw error;
  }
}

// B. Drupal session -----------------------------------------------------

const SESSION_COOKIE = 'drupal_session';

/** POST /login with the form's name and password. */
export async function sessionLogin(cookies: CookieStore, name: string, pass: string): Promise<void> {
  const session = await login(drupal, { name, pass });
  cookies.set(SESSION_COOKIE, JSON.stringify({ cookie: session.cookie, logoutToken: session.logoutToken }), { ...cookieOptions, maxAge: 60 * 60 * 24 });
}

function storedSession(cookies: CookieStore): { cookie: string; logoutToken: string } | null {
  const raw = cookies.get(SESSION_COOKIE)?.value;
  return raw ? (JSON.parse(raw) as { cookie: string; logoutToken: string }) : null;
}

/** A client acting as the session's user. */
export function sessionClient(cookies: CookieStore): JsonApiClient {
  return drupal.extend({ auth: sessionCookie(() => storedSession(cookies)?.cookie) });
}

export async function sessionLogout(cookies: CookieStore): Promise<void> {
  const session = storedSession(cookies);
  cookies.delete(SESSION_COOKIE);
  if (session) await logout(drupal, session).catch(() => {});
}
