import type { ResourceBase, ToMany, ToOne } from '@jsondrop/core';
import type { AddressField, DateTimeString, PathField, Role, TextField, User } from '@jsondrop/drupal';
import type { Adjustment, ColorField, Dimensions, Measurement, OrderMeta, OrderProfile, OrderTotal, PaymentInstrument, Price, ShipmentItem, ShippingRate, TaxNumberField } from './fields.js';

/**
 * Drupal Commerce entity types, as commerce_api exposes them.
 *
 * Resource type names come in two namings, and the types accept both:
 * - commerce_api's: the `commerce_` prefix goes and underscores become
 *   hyphens, so `commerce_product_variation--default` is
 *   `product-variation--default`, served at `/product-variations/default`
 *   (see {@link commerceApiResourcePath});
 * - Drupal's (`commerce_product_variation--default`), wherever JSON:API
 *   Extras overrides the renaming. A site can mix both: check its `/jsonapi`
 *   index, or use `client.withDiscoveredPaths()`.
 *
 * With commerce_api's naming, `drupal_internal__*` fields are hidden and the
 * order's `mail` is `email`.
 *
 * Bundle-specific fields are the project's: extend the generic types and
 * register the bundle.
 *
 * ```ts
 * interface Shirt extends ProductVariation<'shirt'> {
 *   attribute_size: ToOne<ProductAttributeValue<'size'>>;
 * }
 * declare module '@jsondrop/core' {
 *   interface ResourceTypes { 'product-variation--shirt': Shirt }
 * }
 * ```
 */

export interface Store<TBundle extends string = string> extends ResourceBase<`store--${TBundle}` | `commerce_store--${TBundle}`> {
  langcode: string;
  name: string;
  mail?: string;
  timezone?: string;
  address?: AddressField;
  billing_countries?: string[];
  is_default?: boolean;
  path?: PathField;
}

export interface Product<TBundle extends string = string> extends ResourceBase<`product--${TBundle}` | `commerce_product--${TBundle}`> {
  langcode: string;
  title: string;
  status: boolean;
  created: DateTimeString;
  changed: DateTimeString;
  path?: PathField;
  variations: ToMany<ProductVariation>;
  stores?: ToMany<Store>;
  uid?: ToOne<User>;
}

export interface ProductVariation<TBundle extends string = string> extends ResourceBase<`product-variation--${TBundle}` | `commerce_product_variation--${TBundle}`> {
  langcode: string;
  sku: string;
  title: string;
  status: boolean;
  price: Price;
  list_price: Price | null;
  /**
   * The price after price resolvers (promotions, currency, customer
   * group), computed by commerce_api for the request's context.
   */
  resolved_price: Price;
  /** On a shippable variation type, with commerce_shipping. */
  weight?: Measurement | null;
  /** On a variation type with the dimensions trait, with commerce_shipping. */
  dimensions?: Dimensions | null;
  created: DateTimeString;
  changed: DateTimeString;
  product_id?: ToOne<Product>;
}

export interface ProductAttributeValue<TAttribute extends string = string> extends ResourceBase<`product-attribute-value--${TAttribute}` | `commerce_product_attribute_value--${TAttribute}`> {
  langcode: string;
  name: string;
  weight: number;
}

export interface Order<TBundle extends string = string> extends ResourceBase<`order--${TBundle}` | `commerce_order--${TBundle}`> {
  /** Assigned when the order is placed. */
  order_number: string | null;
  email: string | null;
  /** Workflow state: `draft`, `completed`, `canceled`… */
  state: string;
  total_price: Price | null;
  total_paid?: Price | null;
  /** Not on commerce_api's cart and checkout routes: use `order_total.adjustments`. */
  adjustments?: Adjustment[];
  order_total: OrderTotal;
  billing_information: OrderProfile | null;
  /**
   * The profile behind `billing_information`. commerce_api hides it; only
   * present where JSON:API Extras enables it.
   */
  billing_profile?: ToOne<Profile>;
  /** With commerce_shipping. */
  shipping_information?: OrderProfile | null;
  /** The selected {@link ShippingRate} id. With commerce_shipping. */
  shipping_method?: string | null;
  /** With commerce_payment. */
  payment_instrument?: PaymentInstrument | null;
  customer_comments?: string | null;
  placed?: DateTimeString | null;
  completed?: DateTimeString | null;
  created?: DateTimeString;
  changed?: DateTimeString;
  order_items: ToMany<OrderItem>;
  store_id: ToOne<Store>;
  coupons?: ToMany<PromotionCoupon>;
  shipments?: ToMany<Shipment>;
  meta?: OrderMeta;
}

export interface OrderItem<TBundle extends string = string> extends ResourceBase<`order-item--${TBundle}` | `commerce_order_item--${TBundle}`> {
  title: string;
  /** A decimal, as a string: `"1.00"`. */
  quantity: string;
  unit_price: Price;
  total_price: Price;
  adjusted_unit_price?: Price | null;
  adjusted_total_price?: Price | null;
  /** Not on commerce_api's cart and checkout routes: use the order's `order_total.adjustments`. */
  adjustments?: Adjustment[];
  locked: boolean;
  purchased_entity: ToOne<ProductVariation>;
  order_id?: ToOne<Order>;
}

/** A coupon. commerce_api identifies coupons by code in cart requests. */
export interface PromotionCoupon extends ResourceBase<'promotion-coupon' | 'commerce_promotion_coupon--commerce_promotion_coupon'> {
  code: string;
  status?: boolean;
}

export interface Shipment<TBundle extends string = string> extends ResourceBase<`shipment--${TBundle}` | `commerce_shipment--${TBundle}`> {
  title?: string;
  state: string;
  amount: Price | null;
  original_amount?: Price | null;
  adjustments?: Adjustment[];
  items?: ShipmentItem[];
  weight?: Measurement | null;
  shipping_method?: unknown;
  /**
   * The profile behind the order's `shipping_information`. commerce_api hides
   * it; only present where JSON:API Extras enables it.
   */
  shipping_profile?: ToOne<Profile>;
  tracking_code?: string | null;
}

/** `payment--payment-default`, `payment--payment-manual`, … */
export interface Payment<TBundle extends string = string> extends ResourceBase<`payment--${TBundle}` | `commerce_payment--${TBundle}`> {
  state: string;
  amount: Price;
  refunded_amount?: Price | null;
  remote_id?: string | null;
  completed?: DateTimeString | null;
}

/** An item of `GET /checkout/{order}/shipping-methods`. */
export interface ShippingRateOption extends ResourceBase<'shipping-rate-option'>, Omit<ShippingRate, 'id'> {}

/**
 * A profile, which holds an address for an order or a customer's address book.
 * Not renamed: profile is not a Commerce entity. Orders usually read it through
 * `billing_information` and `shipping_information` instead.
 */
export interface Profile<TBundle extends string = string> extends ResourceBase<`profile--${TBundle}`> {
  address?: AddressField | null;
  is_default?: boolean;
  /** With commerce_tax. */
  tax_number?: TaxNumberField | null;
  status?: boolean;
  created?: DateTimeString;
  changed?: DateTimeString;
  uid?: ToOne<User>;
}

/** The `customer` profile, which Commerce gives an address field. */
export interface CustomerProfile extends Profile<'customer'> {
  address: AddressField;
}

/**
 * A promo bar, from the commerce_promo_bar module: a message strip with its
 * own colours, dates, and store, role, country and page restrictions.
 *
 * This is the entity as stored. Which promo bars a visitor sees is decided
 * by the module's `loadVisible()`, and `body.processed` still holds its
 * tokens: JSON:API exposes neither, so a site that shows promo bars serves
 * them from an endpoint of its own.
 */
export interface PromoBar extends ResourceBase<'promo-bar' | 'commerce_promo_bar--commerce_promo_bar'> {
  langcode: string;
  default_langcode?: boolean;
  label: string;
  /** The message. Tokens are allowed and not replaced here. */
  body: TextField;
  background_color: ColorField;
  text_color: ColorField;
  start_date: DateTimeString;
  end_date: DateTimeString | null;
  /** Until when the countdown shows. */
  countdown_date: DateTimeString | null;
  /** Show in these countries only, or hide in them: see `country_visibility`. Empty for all. */
  countries: string[];
  /** `true` shows the promo bar in `countries`, `false` hides it there. */
  country_visibility: boolean;
  /** Paths, one per line; `*` is a wildcard and `<front>` the front page. */
  pages: string | null;
  /** `true` shows the promo bar on `pages`, `false` hides it there. */
  visibility: boolean;
  /** Visitors can close it; the browser remembers that. */
  dismissible: boolean | null;
  weight: number;
  status: boolean;
  created: DateTimeString;
  changed: DateTimeString;
  /** Empty for every store. */
  stores: ToMany<Store>;
  /** Empty for every role. */
  customer_roles: ToMany<Role>;
  /** The promotion its tokens read coupons and details from. */
  promotion_id: ToOne<ResourceBase<'promotion' | `commerce_promotion--${string}`>>;
  uid: ToOne<User>;
}

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'promotion-coupon': PromotionCoupon;
    'commerce_promotion_coupon--commerce_promotion_coupon': PromotionCoupon;
    'promo-bar': PromoBar;
    'commerce_promo_bar--commerce_promo_bar': PromoBar;
    'shipping-rate-option': ShippingRateOption;
    'profile--customer': CustomerProfile;
  }

  interface EntityTypes {
    store: Store;
    product: Product;
    'product-variation': ProductVariation;
    'product-attribute-value': ProductAttributeValue;
    order: Order;
    'order-item': OrderItem;
    shipment: Shipment;
    payment: Payment;
    profile: Profile;
    // Drupal's naming, where JSON:API Extras keeps it.
    commerce_store: Store;
    commerce_product: Product;
    commerce_product_variation: ProductVariation;
    commerce_product_attribute_value: ProductAttributeValue;
    commerce_order: Order;
    commerce_order_item: OrderItem;
    commerce_shipment: Shipment;
    commerce_payment: Payment;
  }
}
