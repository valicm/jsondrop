import type { AddressField } from '@jsondrop/drupal';

/**
 * Value shapes of Commerce fields, as commerce_api normalizes them.
 */

/** A price. Decimal numbers are strings, to keep their precision. */
export interface Price {
  number: string;
  currency_code: string;
  /** Formatted for the request's language: `$1,000.00`. */
  formatted?: string;
}

/** A price adjustment: promotion, tax, shipping, fee… */
export interface Adjustment {
  /** `promotion`, `tax`, `shipping`, `fee`, `custom`, or a custom type. */
  type: string;
  label: string;
  amount: Price;
  /** `0.1` for 10%, when the adjustment is a percentage. */
  percentage: string | null;
  source_id: string | null;
  /** Already included in the price (VAT-inclusive prices). */
  included: boolean;
  locked: boolean;
  /** The amount for the whole item quantity. */
  total?: Price;
}

/** commerce_api's computed `order_total`: subtotal, adjustments, total. */
export interface OrderTotal {
  subtotal: Price;
  adjustments: Adjustment[];
  total: Price;
}

/**
 * commerce_api's computed `billing_information` / `shipping_information`:
 * the profile's address plus its other fields.
 */
export interface OrderProfile {
  address: AddressField;
  [field: string]: unknown;
}

/** commerce_api's computed `payment_instrument`. */
export interface PaymentInstrument {
  payment_gateway_id: string;
  /** UUID of a stored payment method, to pay with it. */
  payment_method_id?: string | null;
  payment_method_type?: string | null;
  /** Gateway-specific details for creating a payment method (a tokenized card). */
  payment_details?: Record<string, unknown> | null;
}

/** A calculated shipping rate. Its `id` is the value for `shipping_method`. */
export interface ShippingRate {
  /** `{shipping_method_id}--{service_id}`, e.g. `2--default`. */
  id: string;
  shipping_method_id: string;
  service: { id: string; label: string };
  original_amount: Price;
  amount: Price;
  description: string | null;
  delivery_date: string | null;
  data: Record<string, unknown> | unknown[];
}

/** A way to pay, from the order's `meta.payment_options`. */
export interface PaymentOption {
  id: string;
  label: string;
  payment_gateway_id: string;
  /** UUID of the stored payment method, when this option is one. */
  payment_method_id: string | null;
  payment_method_type_id: string | null;
}

/** Something the order lacks before it can be paid, from `meta.constraints`. */
export interface Constraint {
  required: {
    detail: string;
    source: { pointer: string };
  };
}

/** The meta commerce_api adds to orders, and on checkout routes. */
export interface OrderMeta {
  constraints?: Constraint[];
  /** Checkout routes only. */
  payment_options?: PaymentOption[];
  /** Checkout routes only, when the order is shippable. */
  shipping_rates?: ShippingRate[];
  [key: string]: unknown;
}
