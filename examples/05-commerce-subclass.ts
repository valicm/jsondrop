/**
 * Example 5: extending CommerceApi for a store's own modules.
 *
 * Every method of CommerceApi wraps one commerce_api endpoint and can be
 * overridden; `this.client` is the configured client (commerce_api paths,
 * cart token), and `cartPath()` / `checkoutPath()` build paths for new
 * endpoints.
 */
import { isStub, JsonApiClient, type ResourceRequestOptions } from '@jsondrop/core';
import {
  CommerceApi,
  checkoutStatus,
  type CartAddItem,
  type CommerceApiOptions,
  type OrderItem,
  type OrderRef,
  type Payment,
} from '@jsondrop/commerce';
import type { WebOrder } from './04-commerce-types.js';

/** What the store's payment flow can answer, beyond a placed order. */
export type PaymentResult =
  | { status: 'placed'; payment: Payment }
  | { status: 'action'; action: Record<string, unknown> };

export interface ShopOptions extends CommerceApiOptions {
  /** Currency and country, read by a custom price resolver module. */
  market: { country: string; currency: string };
}

export class ShopApi extends CommerceApi {
  constructor(client: JsonApiClient, override readonly options: ShopOptions) {
    // Site-specific headers go on the client every request uses.
    super(client.extend({ headers: { 'X-Country': options.market.country, 'X-Currency': options.market.currency } }), options);
  }

  // `withCartToken()` and `with()` build a new instance with the same
  // constructor arguments, so they keep working: ShopApi takes (client, options).

  /**
   * Methods are generic, typed with the package's types by default. An
   * override keeps the type parameter and changes its default: the store's
   * order type here.
   */
  override async getCart<T = WebOrder>(order: OrderRef, options?: ResourceRequestOptions): Promise<T> {
    return super.getCart<T>(order, options);
  }

  /** Adds an endpoint of a custom module (a JSON:API resource it defines). */
  async setGiftMessage(orderId: string, item: OrderItem, message: string): Promise<void> {
    await this.client.patch(`${this.cartPath(orderId)}/items/${item.id}/gift-message`, {
      data: { type: item.type, id: item.id, attributes: { message } },
    });
  }

  /** Changes a default: every add-to-cart records where it came from. */
  override async addToCart<T = OrderItem>(items: CartAddItem | CartAddItem[], options?: ResourceRequestOptions): Promise<T[]> {
    const list = (Array.isArray(items) ? items : [items]).map((item) => ({ ...item, fields: { field_source: 'web', ...item.fields } }));
    return super.addToCart<T>(list, options);
  }

  /**
   * A gateway module that answers 202 with a 3-D Secure step in `meta`:
   * createPayment() returns the whole response, so the subclass decides.
   */
  async pay(orderId: string, gatewayId: string): Promise<PaymentResult> {
    const response = await this.createPayment(orderId, { gatewayId });
    if (response.status === 202 && response.meta.action) {
      return { status: 'action', action: response.meta.action as Record<string, unknown> };
    }
    return { status: 'placed', payment: response.data };
  }
}

/** A checkout from cart to placed order, with the subclass. */
export async function checkout(shop: ShopApi, email: string) {
  const [cart] = await shop.getCarts();
  if (!cart) throw new Error('Empty cart');

  const address = { country_code: 'HR', locality: 'Zagreb', postal_code: '10000', address_line1: 'Ilica 1', given_name: 'Ana', family_name: 'Horvat' };
  await shop.updateCheckout(cart.id, { email, billing_information: { address }, shipping_information: { address } });

  // Rates depend on the shipping address, so pick one after setting it.
  const [rate] = await shop.getShippingMethods(cart.id);
  if (rate) await shop.updateCheckout(cart.id, { shipping_method: rate.id });

  const order = await shop.getCheckout(cart.id);
  const status = checkoutStatus(order);
  const option = status.paymentOptions[0];
  if (!option) throw new Error('No payment options');
  await shop.updateCheckout(cart.id, { payment_instrument: { payment_gateway_id: option.payment_gateway_id } });

  // The checkout meta is fresh after the last change.
  const ready = checkoutStatus(await shop.getCheckout(cart.id));
  if (!ready.ready) {
    return { status: 'incomplete', missing: ready.constraints.map((constraint) => constraint.required.source.pointer) } as const;
  }
  return shop.pay(cart.id, option.payment_gateway_id);
}

/** Items of a cart with their variation, skipping ones that were not included. */
export function cartLines(cart: WebOrder) {
  return cart.order_items.filter((item) => !isStub(item)).map((item) => {
    const line = item as Exclude<typeof item, { stub: true }>;
    const variation = isStub(line.purchased_entity) ? null : line.purchased_entity;
    return { id: line.id, title: line.title, quantity: Number(line.quantity), total: line.total_price.formatted, sku: variation?.sku ?? null };
  });
}
