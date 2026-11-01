import { JsonApiClient, type Resource } from '@jsondrop/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  checkoutStatus,
  CommerceApi,
  commerceApiResourcePath,
  createCartToken,
  withCommerceApi,
  type Order,
  type OrderItem,
  type Product,
  type ProductVariation,
  type PromotionCoupon,
} from '../src/index.js';
import { json, mockFetch } from '../../core/test/mock-fetch.js';

const BASE = 'https://shop.example.com/jsonapi';
const price = (number: string) => ({ number, currency_code: 'USD', formatted: `$${number}` });

const orderItem = {
  type: 'order-item--default',
  id: 'oi1',
  attributes: { title: 'Shirt', quantity: '1.00', unit_price: price('10.00'), total_price: price('10.00'), locked: false },
  relationships: {
    order_id: { data: { type: 'order--default', id: 'o1' } },
    purchased_entity: { data: { type: 'product-variation--default', id: 'v1' } },
  },
};

const order = {
  type: 'order--default',
  id: 'o1',
  attributes: {
    order_number: null,
    email: null,
    state: 'draft',
    total_price: price('10.00'),
    order_total: { subtotal: price('10.00'), adjustments: [], total: price('10.00') },
    billing_information: null,
    shipping_information: null,
    shipping_method: '',
    payment_instrument: null,
  },
  relationships: {
    order_items: { data: [{ type: 'order-item--default', id: 'oi1' }] },
    store_id: { data: { type: 'store--online', id: 's1' } },
  },
  meta: {
    constraints: [{ required: { detail: 'This value should not be null.', source: { pointer: 'billing_profile' } } }],
    payment_options: [{ id: 'cod', label: 'Cash on delivery', payment_gateway_id: 'cod', payment_method_id: null, payment_method_type_id: null }],
  },
};

function commerce(...responses: Parameters<typeof mockFetch>) {
  const mock = mockFetch(...responses);
  const api = new CommerceApi(new JsonApiClient({ baseUrl: 'https://shop.example.com', fetch: mock.fetch }));
  return { api, calls: mock.calls };
}

describe('resource paths and types', () => {
  it('maps commerce_api types to their paths', () => {
    expect(commerceApiResourcePath('product--default')).toBe('/products/default');
    expect(commerceApiResourcePath('product-variation--t_shirt')).toBe('/product-variations/t_shirt');
    expect(commerceApiResourcePath('promotion-coupon')).toBe('/promotion-coupons');
    expect(commerceApiResourcePath('node--article')).toBeUndefined();
    expect(commerceApiResourcePath('profile--customer')).toBeUndefined();
  });

  it('types catalog reads', async () => {
    const { fetch, calls } = mockFetch(json({ data: [] }));
    const drupal = withCommerceApi(new JsonApiClient({ baseUrl: 'https://shop.example.com', fetch }));
    const products = await drupal.getCollection('product--default', { query: { include: ['variations'] } });
    expectTypeOf(products).toEqualTypeOf<Array<Product & Resource>>();
    expectTypeOf(drupal.getResource('product-variation--default', 'v1')).resolves.toEqualTypeOf<ProductVariation & Resource>();
    expectTypeOf(drupal.getResource('promotion-coupon', 'c1')).resolves.toEqualTypeOf<PromotionCoupon>();
    expect(calls[0]!.url).toBe(`${BASE}/products/default?include=variations`);
  });
});

describe('CommerceApi cart', () => {
  it('makes cart tokens', () => {
    expect(createCartToken()).toMatch(/^[0-9a-f-]{36}$/);
    expect(createCartToken()).not.toBe(createCartToken());
  });

  it('reads carts with the cart token and default includes', async () => {
    const { api, calls } = commerce(json({ data: [order], included: [orderItem] }));
    const [cart] = await api.withCartToken('tok').getCarts();

    expectTypeOf(cart!).toEqualTypeOf<Order>();
    expect(cart!.state).toBe('draft');
    expect((cart!.order_items[0] as OrderItem).quantity).toBe('1.00');
    expect(decodeURIComponent(calls[0]!.url)).toBe(`${BASE}/carts?include=order_items,order_items.purchased_entity,coupons`);
    expect(calls[0]!.headers.get('Commerce-Cart-Token')).toBe('tok');
  });

  it('keeps the subclass when switching cart tokens', () => {
    class Shop extends CommerceApi {}
    const shop = new Shop(new JsonApiClient({ baseUrl: 'https://x.test' })).withCartToken('a');
    expect(shop).toBeInstanceOf(Shop);
    expect(shop.options.cartToken).toBe('a');
  });

  it('adds to cart', async () => {
    const { api, calls } = commerce(json({ data: [orderItem] }));
    const items = await api.addToCart([
      { type: 'product-variation--default', id: 'v1', quantity: 2 },
      { type: 'product-variation--default', id: 'v2', combine: false, fields: { field_engraving: 'Hi' } },
    ]);
    expect(items[0]!.id).toBe('oi1');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${BASE}/cart/add`);
    expect(calls[0]!.body).toEqual({
      data: [
        { type: 'product-variation--default', id: 'v1', meta: { quantity: 2 } },
        { type: 'product-variation--default', id: 'v2', meta: { field_engraving: 'Hi', combine: false } },
      ],
    });
  });

  it('updates and removes items, coupons, and clears', async () => {
    const { api, calls } = commerce(json({ data: orderItem }), json({ data: order }), json({ data: [] }), json(null, 204), json(null, 204));
    await api.updateCartItem('o1', { type: 'order-item--default', id: 'oi1' }, { quantity: 3 });
    await api.removeCartItems('o1', { type: 'order-item--default', id: 'oi1' });
    await api.applyCoupons('o1', 'SAVE10');
    await api.removeCoupons('o1');
    await api.clearCart('o1');

    expect(calls.map((call) => `${call.method} ${call.url.replace(BASE, '')}`)).toEqual([
      'PATCH /carts/o1/items/oi1',
      'DELETE /carts/o1/items',
      'PATCH /carts/o1/coupons',
      'DELETE /carts/o1/coupons',
      'DELETE /carts/o1',
    ]);
    expect(calls[0]!.body).toEqual({ data: { type: 'order-item--default', id: 'oi1', attributes: { quantity: 3 } } });
    expect(calls[1]!.body).toEqual({ data: [{ type: 'order-item--default', id: 'oi1' }] });
    expect(calls[2]!.body).toEqual({ data: [{ type: 'promotion-coupon', id: 'SAVE10' }] });
  });
});

describe('CommerceApi checkout', () => {
  it('reads checkout status from meta', async () => {
    const { api } = commerce(json({ data: order }));
    const status = checkoutStatus(await api.getCheckout('o1'));
    expect(status.ready).toBe(false);
    expect(status.constraints[0]!.required.source.pointer).toBe('billing_profile');
    expect(status.paymentOptions[0]!.payment_gateway_id).toBe('cod');
    expect(status.shippingRates).toEqual([]);
  });

  it('updates checkout fields', async () => {
    const { api, calls } = commerce(json({ data: order }));
    await api.updateCheckout('o1', {
      email: 'a@example.com',
      billing_information: { address: { country_code: 'US', postal_code: '94043' } },
      shipping_method: '2--default',
    });
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe(`${BASE}/checkout/o1`);
    expect(calls[0]!.body).toEqual({
      data: {
        type: 'order--default',
        id: 'o1',
        attributes: { email: 'a@example.com', billing_information: { address: { country_code: 'US', postal_code: '94043' } }, shipping_method: '2--default' },
      },
    });
  });

  it('lists shipping methods', async () => {
    const rate = { type: 'shipping-rate-option', id: '2--default', attributes: { shipping_method_id: '2', service: { id: 'default', label: 'Flat rate' }, original_amount: price('20'), amount: price('20'), delivery_date: null, description: '', data: [] } };
    const { api, calls } = commerce(json({ data: [rate] }));
    const [option] = await api.getShippingMethods('o1');
    expect(option!.service.label).toBe('Flat rate');
    expect(calls[0]!.url).toBe(`${BASE}/checkout/o1/shipping-methods`);
  });

  it('creates payments with the gateway\'s payment type', async () => {
    const { api, calls } = commerce(json({ data: { type: 'payment--payment-manual', id: 'p1', attributes: { state: 'pending', amount: price('10.00') } } }, 201));
    const response = await api.createPayment('o1', { gatewayId: 'manual' });
    await api.createPayment('o1', { gatewayId: 'stripe', capture: false });
    await api.createPayment('o1', { type: 'payment--payment-custom' });

    expect(response.status).toBe(201);
    expect(response.data.state).toBe('pending');
    expect(calls.map((call) => call.body)).toEqual([
      { data: { type: 'payment--payment-manual' } },
      { data: { type: 'payment--payment-default', attributes: { capture: false } } },
      { data: { type: 'payment--payment-custom' } },
    ]);
    expect(calls[0]!.url).toBe(`${BASE}/checkout/o1/payment`);
  });

  it('approves an offsite payment with the provider\'s parameters', async () => {
    const { api, calls } = commerce(json({ data: { ...order, attributes: { ...order.attributes, state: 'completed' } } }));
    const placed = await api.approvePayment('o1', { PayerID: 'X1' });
    expect(placed.state).toBe('completed');
    expect(calls[0]!.url).toBe(`${BASE}/checkout/o1/payment/approve?PayerID=X1`);
  });

  it('reads the current store', async () => {
    const { api, calls } = commerce(json({ data: { type: 'store--online', id: 's1', attributes: { name: 'Shop', langcode: 'en' } } }));
    expect((await api.getCurrentStore()).name).toBe('Shop');
    expect(calls[0]!.url).toBe(`${BASE}/current-store`);
  });
});

describe('naming', () => {
  it('uses the order\'s own type when given the order', async () => {
    const { api, calls } = commerce(json({ data: order }));
    await api.updateCheckout({ id: 'o1', type: 'order--regular' }, { email: 'a@example.com' });
    expect(calls[0]!.url).toBe(`${BASE}/checkout/o1`);
    expect(calls[0]!.body).toMatchObject({ data: { type: 'order--regular', id: 'o1' } });
  });

  it('follows Drupal\'s naming when asked', async () => {
    const mock = mockFetch(json({ data: order }));
    const api = new CommerceApi(new JsonApiClient({ baseUrl: 'https://shop.example.com', fetch: mock.fetch }), { naming: 'drupal' });
    await api.applyCoupons('o1', 'SAVE10');
    await api.createPayment('o1', { gatewayId: 'manual' });
    await api.createPayment('o1', { gatewayId: 'adyen' });
    await api.updateCheckout('o1', { email: 'a@example.com' });
    expect(mock.calls.map((call) => (call.body as { data: { type: string } | Array<{ type: string }> }).data)).toEqual([
      [{ type: 'commerce_promotion_coupon--commerce_promotion_coupon', id: 'SAVE10' }],
      { type: 'commerce_payment--payment_manual' },
      { type: 'commerce_payment--payment_default' },
      { type: 'commerce_order--default', id: 'o1', attributes: { email: 'a@example.com' } },
    ]);
  });

  it('types resources in Drupal\'s naming', async () => {
    const { fetch } = mockFetch(json({ data: null }));
    const drupal = new JsonApiClient({ baseUrl: 'https://shop.example.com', fetch });
    expectTypeOf(drupal.getResource('commerce_product_variation--device', 'v1')).resolves.toEqualTypeOf<ProductVariation & Resource>();
    expectTypeOf(drupal.getResource('commerce_order--regular', 'o1')).resolves.toEqualTypeOf<Order & Resource>();
  });
});
