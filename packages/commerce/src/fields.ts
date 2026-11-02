import type { AddressField, DateTimeString, DecimalString } from '@jsondrop/drupal';

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
  /** `"0.1"` for 10%, when the adjustment is a percentage. */
  percentage: string | null;
  source_id: string | null;
  /** Already included in the price (VAT-inclusive prices). */
  included: boolean;
  locked: boolean;
}

/** An adjustment in `order_total`. Unlike the field, `percentage` is a number. */
export interface OrderTotalAdjustment extends Omit<Adjustment, 'percentage'> {
  /** `0.1` for 10%, when the adjustment is a percentage. */
  percentage: number | null;
  /** The amount for the whole item quantity. */
  total: Price;
}

/** commerce_api's computed `order_total`: subtotal, adjustments, total. */
export interface OrderTotal {
  subtotal: Price;
  adjustments: OrderTotalAdjustment[];
  total: Price;
}

/**
 * commerce_api's computed `billing_information` / `shipping_information`:
 * the profile's address plus its other fields. `field_phone` arrives as
 * `phone`: the `field_` prefix goes, unless another field already has that name.
 * Fields come from the `customer` profile bundle, on both. Extend this type for
 * your own fields.
 */
export interface OrderProfile {
  address: AddressField;
  /** With commerce_tax. */
  tax_number?: TaxNumberField | null;
  [field: string]: unknown;
}

/** The `commerce_tax_number` field type. */
export interface TaxNumberField {
  /** The plugin that validates it: `european_union_vat`, `other`, … */
  type: string;
  value: string;
  /** The `verification_*` properties are absent in `billing_information`. */
  verification_state?: string | null;
  verification_timestamp?: DateTimeString | null;
  verification_result?: Record<string, unknown> | null;
}

/** The `physical_measurement` field type, such as a weight. */
export interface Measurement {
  number: DecimalString;
  /** `kg`, `lb`, … */
  unit: string;
}

/** The `physical_dimensions` field type. */
export interface Dimensions {
  length: DecimalString;
  width: DecimalString;
  height: DecimalString;
  /** `cm`, `in`, … */
  unit: string;
}

/** An item of a shipment: the `commerce_shipment_item` field type. */
export interface ShipmentItem {
  /** The order item's UUID, `null` once that order item is gone. */
  order_item_id: string | null;
  title: string;
  quantity: DecimalString;
  weight: Measurement;
  declared_value: Price;
  tariff_code: string | null;
}

/**
 * The `commerce_plugin_item` field type: a configured plugin, such as a
 * promotion's offer or a coupon's conditions.
 */
export interface PluginItemField {
  target_plugin_id: string;
  target_plugin_configuration: Record<string, unknown>;
}

/** The `commerce_remote_id` field type: an ID at an outside provider. */
export interface RemoteIdField {
  provider: string;
  remote_id: string;
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
