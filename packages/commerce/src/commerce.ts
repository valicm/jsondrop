import type { JsonApiClient, JsonApiResponse, ResourceRequestOptions } from '@jsondrop/core';
import type { Order, OrderItem, Payment, ShippingRateOption, Store } from './entities.js';
import type { Constraint, OrderProfile, PaymentInstrument, PaymentOption, ShippingRate } from './fields.js';
import { commerceApiResourcePath, createCommerceApiResourcePath } from './paths.js';

/** The header commerce_api reads the cart token from. */
export const CART_TOKEN_HEADER = 'Commerce-Cart-Token';

/**
 * A new cart token. commerce_api never issues one: the client makes one
 * up, sends it with every cart and checkout request, and the carts created
 * under it belong to whoever holds it. Treat it like a session ID: keep it
 * in an httpOnly cookie, never in a URL.
 */
export function createCartToken(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * A client that resolves commerce_api's renamed resource paths. Pass
 * `entityTypes` for `commerce_*` entity types of other modules, in
 * commerce_api's naming (`commerce_license` → `license`).
 */
export function withCommerceApi(client: JsonApiClient, entityTypes?: readonly string[]): JsonApiClient {
  return client.extend({ resolveResourcePath: entityTypes?.length ? createCommerceApiResourcePath(entityTypes) : commerceApiResourcePath });
}

export interface CommerceApiOptions {
  /** Sent as `Commerce-Cart-Token`; see {@link createCartToken}. */
  cartToken?: string;
  /**
   * Other `commerce_*` entity types to resolve paths for, in commerce_api's
   * naming; see {@link withCommerceApi}.
   */
  entityTypes?: readonly string[];
  /** Default `include` for cart reads. */
  cartInclude?: string[];
  /**
   * Resource type naming the defaults below follow. Default `commerce_api`.
   * A site can mix both (JSON:API Extras configs per type): set the types
   * that differ explicitly.
   */
  naming?: CommerceNaming;
  /**
   * Order resource type, for checkout updates given an order ID; given an
   * order, its own type is used. Default `order--default`.
   */
  orderType?: string;
  /** Coupon resource type. Default `promotion-coupon`. */
  couponType?: string;
  /**
   * Payment resource type for a gateway. Default: `payment--payment-manual`
   * for a gateway named `manual`, else `payment--payment-default`.
   */
  paymentType?: (gatewayId: string | undefined) => string;
}

export interface CartAddItem {
  /** Purchasable entity resource type, e.g. `product-variation--default`. */
  type: string;
  id: string;
  quantity?: number | string;
  /** Merge with an existing line of the same variation. Default true. */
  combine?: boolean;
  /** Other order item fields to set (must be editable by the customer). */
  fields?: Record<string, unknown>;
}

export interface CartItemChanges {
  quantity?: number | string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { type: string; id: string } | Array<{ type: string; id: string }> | null>;
}

/**
 * Checkout changes. Order profile fields take the whole profile
 * (`{ address: { country_code: 'US', … } }`; the country code is always
 * required). Configurable order fields can be set too.
 */
export interface CheckoutChanges {
  email?: string;
  billing_information?: Partial<OrderProfile> & { address: OrderProfile['address'] };
  shipping_information?: Partial<OrderProfile> & { address: OrderProfile['address'] };
  /** A {@link ShippingRate} id. */
  shipping_method?: string;
  payment_instrument?: PaymentInstrument;
  customer_comments?: string;
  [field: string]: unknown;
}

export interface CreatePaymentOptions extends ResourceRequestOptions {
  /** The gateway, to pick the payment resource type. */
  gatewayId?: string;
  /** Payment resource type, overriding {@link CommerceApiOptions.paymentType}. */
  type?: string;
  /** Capture now (default) or only authorize, for gateways that support it. */
  capture?: boolean;
}

export const DEFAULT_CART_INCLUDE = ['order_items', 'order_items.purchased_entity', 'coupons'];

type Identifier = { type: string; id: string };

/**
 * An order: its UUID, or the order itself (anything with `id` and `type`,
 * like what `getCarts()` returns). Passing the order lets requests that
 * send its type use the real one.
 */
export type OrderRef = string | { id: string; type: string };

function orderIdOf(order: OrderRef): string {
  return typeof order === 'string' ? order : order.id;
}

/**
 * Resource type naming. `commerce_api` is the module's own renaming
 * (`order--default`, `promotion-coupon`); `drupal` is Drupal's
 * (`commerce_order--default`), which is what a site gets where JSON:API
 * Extras overrides the renaming.
 */
export type CommerceNaming = 'commerce_api' | 'drupal';

const NAMES: Record<CommerceNaming, { order: string; coupon: string; payment: string; manualPayment: string }> = {
  commerce_api: {
    order: 'order--default',
    coupon: 'promotion-coupon',
    payment: 'payment--payment-default',
    manualPayment: 'payment--payment-manual',
  },
  drupal: {
    order: 'commerce_order--default',
    coupon: 'commerce_promotion_coupon--commerce_promotion_coupon',
    payment: 'commerce_payment--payment_default',
    manualPayment: 'commerce_payment--payment_manual',
  },
};

/**
 * Cart, checkout and payment through the commerce_api module.
 *
 * Every method is a thin, overridable wrapper around one endpoint, so a
 * project extends it by subclassing: add methods for its own resources,
 * or override one to change what it sends or returns.
 *
 * ```ts
 * const commerce = new CommerceApi(drupal).withCartToken(token);
 * await commerce.addToCart({ type: 'product-variation--default', id, quantity: 2 });
 * const [cart] = await commerce.getCarts();
 * ```
 */
export class CommerceApi {
  /** The client requests go through: commerce_api paths, cart token header. */
  readonly client: JsonApiClient;

  constructor(
    /** The client as given, without the cart token. */
    protected readonly baseClient: JsonApiClient,
    readonly options: CommerceApiOptions = {},
  ) {
    const token = options.cartToken;
    this.client = withCommerceApi(baseClient, options.entityTypes).extend(token ? { headers: { [CART_TOKEN_HEADER]: token } } : {});
  }

  /** The same API for another cart token; subclasses get their own class back. */
  withCartToken(cartToken: string | undefined): this {
    return this.with({ cartToken });
  }

  /** A copy with options changed. Subclasses with other constructor arguments override it. */
  with(options: Partial<CommerceApiOptions>): this {
    const Class = this.constructor as new (client: JsonApiClient, options: CommerceApiOptions) => this;
    return new Class(this.baseClient, { ...this.options, ...options });
  }

  // Store.

  /** The store the request resolves to. */
  async getCurrentStore<T = Store>(options?: ResourceRequestOptions): Promise<T> {
    return (await this.client.get<T>('/current-store', options)).data;
  }

  // Cart.

  /** The carts of the cart token (and of the signed-in customer). */
  async getCarts<T = Order>(options?: ResourceRequestOptions): Promise<T[]> {
    const response = await this.client.get<T[]>('/carts', this.withCartInclude(options));
    return response.data ?? [];
  }

  async getCart<T = Order>(order: OrderRef, options?: ResourceRequestOptions): Promise<T> {
    return (await this.client.get<T>(this.cartPath(order), this.withCartInclude(options))).data;
  }

  /**
   * Adds purchasable entities to the cart of their store and order type,
   * creating it if needed. Returns the created or updated order items.
   */
  async addToCart<T = OrderItem>(items: CartAddItem | CartAddItem[], options?: ResourceRequestOptions): Promise<T[]> {
    const data = (Array.isArray(items) ? items : [items]).map((item) => ({
      type: item.type,
      id: item.id,
      meta: {
        ...item.fields,
        ...(item.quantity === undefined ? {} : { quantity: item.quantity }),
        ...(item.combine === undefined ? {} : { combine: item.combine }),
      },
    }));
    const response = await this.client.post<T[]>('/cart/add', { data }, options);
    return response.data ?? [];
  }

  /** Changes an item's quantity or other fields (not its purchased entity). */
  async updateCartItem<T = OrderItem>(order: OrderRef, item: Identifier, changes: CartItemChanges, options?: ResourceRequestOptions): Promise<T> {
    const attributes = { ...changes.attributes, ...(changes.quantity === undefined ? {} : { quantity: changes.quantity }) };
    const body = {
      data: {
        type: item.type,
        id: item.id,
        ...(Object.keys(attributes).length ? { attributes } : {}),
        ...(changes.relationships
          ? {
              relationships: Object.fromEntries(
                Object.entries(changes.relationships).map(([name, value]) => [name, { data: value === null ? null : Array.isArray(value) ? value.map(identifier) : identifier(value) }]),
              ),
            }
          : {}),
      },
    };
    return (await this.client.patch<T>(`${this.cartPath(order)}/items/${item.id}`, body, options)).data;
  }

  /** Removes items; returns the updated cart. */
  async removeCartItems<T = Order>(order: OrderRef, items: Identifier | Identifier[], options?: ResourceRequestOptions): Promise<T> {
    const data = (Array.isArray(items) ? items : [items]).map(identifier);
    return (await this.client.delete<T>(`${this.cartPath(order)}/items`, { data }, options)).data;
  }

  /** Removes every item. */
  async clearCart(order: OrderRef, options?: ResourceRequestOptions): Promise<void> {
    await this.client.delete(this.cartPath(order), undefined, options);
  }

  /** Applies coupon codes. An unknown or disabled code throws a 422. */
  async applyCoupons(order: OrderRef, codes: string | string[], options?: ResourceRequestOptions): Promise<void> {
    const type = this.options.couponType ?? this.names.coupon;
    const data = (Array.isArray(codes) ? codes : [codes]).map((code) => ({ type, id: code }));
    await this.client.patch(`${this.cartPath(order)}/coupons`, { data }, options);
  }

  /** Removes every coupon. */
  async removeCoupons(order: OrderRef, options?: ResourceRequestOptions): Promise<void> {
    await this.client.delete(`${this.cartPath(order)}/coupons`, undefined, options);
  }

  // Checkout.

  /**
   * The order in checkout, with `meta.constraints`, `meta.shipping_rates`
   * and `meta.payment_options` (see {@link checkoutStatus}). The first
   * read starts checkout.
   */
  async getCheckout<T = Order>(order: OrderRef, options?: ResourceRequestOptions): Promise<T> {
    return (await this.client.get<T>(this.checkoutPath(order), options)).data;
  }

  /**
   * Sets checkout fields. Set billing information before a payment
   * instrument, and shipping information before a shipping method.
   */
  async updateCheckout<T = Order>(order: OrderRef, changes: CheckoutChanges, options?: ResourceRequestOptions & { orderType?: string }): Promise<T> {
    const { orderType, ...rest } = options ?? {};
    const type = orderType ?? (typeof order === 'object' ? order.type : undefined) ?? this.options.orderType ?? this.names.order;
    const body = { data: { type, id: orderIdOf(order), attributes: changes } };
    return (await this.client.patch<T>(this.checkoutPath(order), body, rest)).data;
  }

  /** The shipping rates for the order's shipping address. */
  async getShippingMethods<T = ShippingRateOption>(order: OrderRef, options?: ResourceRequestOptions): Promise<T[]> {
    const response = await this.client.get<T[]>(`${this.checkoutPath(order)}/shipping-methods`, options);
    return response.data ?? [];
  }

  /**
   * Pays the order's balance with its payment instrument (onsite and
   * manual gateways) and places the order. Returns the whole response, so
   * gateway modules that answer with more than the payment (a 3-D Secure
   * step in `meta`) can be handled by the caller.
   */
  async createPayment<T = Payment>(order: OrderRef, options: CreatePaymentOptions = {}): Promise<JsonApiResponse<T>> {
    const { gatewayId, type, capture, ...rest } = options;
    const paymentType = type ?? this.options.paymentType?.(gatewayId) ?? (gatewayId === 'manual' ? this.names.manualPayment : this.names.payment);
    const body = { data: { type: paymentType, ...(capture === undefined ? {} : { attributes: { capture } }) } };
    return this.client.post<T>(`${this.checkoutPath(order)}/payment`, body, rest);
  }

  /**
   * Completes an offsite payment when the customer is back from the
   * provider: forwards the provider's return parameters to the gateway's
   * `onReturn()` and places the order.
   *
   * Drupal's JSON:API rejects query parameters named only with a-z; a
   * provider that returns such a parameter (`token`) needs it renamed.
   */
  async approvePayment<T = Order>(order: OrderRef, params: Record<string, string | string[]> = {}, options?: ResourceRequestOptions): Promise<T> {
    return (await this.client.get<T>(`${this.checkoutPath(order)}/payment/approve`, { ...options, query: { params } })).data;
  }

  // Paths, for subclasses adding endpoints.

  protected cartPath(order: OrderRef): string {
    return `/carts/${encodeURIComponent(orderIdOf(order))}`;
  }

  protected checkoutPath(order: OrderRef): string {
    return `/checkout/${encodeURIComponent(orderIdOf(order))}`;
  }

  /** The default type names of the configured naming. */
  protected get names() {
    return NAMES[this.options.naming ?? 'commerce_api'];
  }

  private withCartInclude(options: ResourceRequestOptions | undefined): ResourceRequestOptions {
    if (options?.query !== undefined) return options;
    return { ...options, query: { include: this.options.cartInclude ?? DEFAULT_CART_INCLUDE } };
  }
}

function identifier(value: Identifier): Identifier {
  return { type: value.type, id: value.id };
}

export interface CheckoutStatus {
  /** What the order lacks before it can be paid; empty when ready. */
  constraints: Constraint[];
  shippingRates: ShippingRate[];
  paymentOptions: PaymentOption[];
  /** No constraints left. */
  ready: boolean;
}

/** Reads commerce_api's checkout meta off an order. */
export function checkoutStatus(order: Pick<Order, 'meta'>): CheckoutStatus {
  const constraints = order.meta?.constraints ?? [];
  return {
    constraints,
    shippingRates: order.meta?.shipping_rates ?? [],
    paymentOptions: order.meta?.payment_options ?? [],
    ready: constraints.length === 0,
  };
}
