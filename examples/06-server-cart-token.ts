/**
 * Example 6: keeping the cart token on the server.
 *
 * The cart token owns the visitor's carts, so it belongs in an httpOnly
 * cookie of your app and is sent to Drupal only from the server. This is
 * framework-neutral: give it your framework's cookie store. In Next.js
 * (App Router), that is `await cookies()` from `next/headers`, in a server
 * action or route handler.
 */
import { JsonApiClient } from '@jsondrop/core';
import { CommerceApi, createCartToken } from '@jsondrop/commerce';

/** The parts of a cookie store this needs (Next's `cookies()` fits). */
export interface CookieStore {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: { httpOnly: boolean; sameSite: 'lax'; path: string; secure: boolean; maxAge: number }): void;
  delete(name: string): void;
}

const CART_COOKIE = 'cart_token';

const drupal = new JsonApiClient({
  baseUrl: process.env.DRUPAL_URL ?? 'https://shop.example.com',
  // Carts are per visitor: never cache them.
  fetchOptions: { cache: 'no-store' },
});

const commerce = new CommerceApi(drupal);

/** Commerce for the visitor; no token until they add something. */
export function visitorCommerce(cookies: CookieStore): CommerceApi {
  return commerce.withCartToken(cookies.get(CART_COOKIE)?.value);
}

/** Commerce for a write that may create the first cart: makes the token. */
export function ensureVisitorCommerce(cookies: CookieStore): CommerceApi {
  let token = cookies.get(CART_COOKIE)?.value;
  if (!token) {
    token = createCartToken();
    cookies.set(CART_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 60 * 60 * 24 * 30 });
  }
  return commerce.withCartToken(token);
}

/** After the order is placed, start a fresh cart next time. */
export function forgetCart(cookies: CookieStore): void {
  cookies.delete(CART_COOKIE);
}

// In a Next.js server action:
//
//   'use server';
//   import { cookies } from 'next/headers';
//
//   export async function addToCart(variationId: string) {
//     const commerce = ensureVisitorCommerce(await cookies());
//     await commerce.addToCart({ type: 'product-variation--default', id: variationId });
//     revalidatePath('/cart');
//   }
