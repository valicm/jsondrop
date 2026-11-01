import { JsonApiClient, type Resource } from '@jsondrop/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  bundleItems,
  CommerceApi,
  createCommerceApiResourcePath,
  isVariationBundle,
  withCommerceApi,
  type BundleItem,
  type ProductVariation,
  type VariationBundle,
} from '../src/index.js';
import { json, mockFetch } from '../../core/test/mock-fetch.js';

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'product-variation--test_bundle': VariationBundle<'test_bundle'>;
  }
}

const price = (number: string) => ({ number, currency_code: 'EUR', formatted: `${number} €` });

/** A bundle variation with three items: two included (one disabled), one not. */
const bundleDocument = {
  data: {
    type: 'product-variation--test_bundle',
    id: 'vb1',
    attributes: { sku: 'SET-1', title: 'Gift set', status: true, price: price('90.00'), resolved_price: price('81.00'), bundle_discount: 10, bundle_split: true },
    relationships: {
      bundle_items: {
        data: [
          { type: 'bundle-item--default', id: 'bi1' },
          { type: 'bundle-item--default', id: 'bi2' },
          { type: 'bundle-item--default', id: 'bi3' },
        ],
      },
    },
  },
  included: [
    {
      type: 'bundle-item--default',
      id: 'bi1',
      attributes: { title: '2x Cleanser', status: true, quantity: '2.00', price: price('30.00') },
      relationships: { variation: { data: { type: 'product-variation--default', id: 'v1' } } },
    },
    {
      type: 'bundle-item--default',
      id: 'bi2',
      attributes: { title: '1x Retired', status: false, quantity: '1.00', price: price('5.00') },
      relationships: { variation: { data: { type: 'product-variation--default', id: 'v9' } } },
    },
    { type: 'product-variation--default', id: 'v1', attributes: { sku: 'CLEAN', title: 'Cleanser', price: price('30.00'), resolved_price: price('30.00') } },
  ],
};

describe('variation bundles', () => {
  it('reads a bundle with its items and their variations', async () => {
    const { fetch, calls } = mockFetch(json(bundleDocument));
    const drupal = withCommerceApi(new JsonApiClient({ baseUrl: 'https://shop.example.com', fetch }));
    const bundle = await drupal.getResource('product-variation--test_bundle', 'vb1', { query: { include: ['bundle_items.variation'] } });

    expectTypeOf(bundle).toEqualTypeOf<VariationBundle<'test_bundle'>>();
    expect(calls[0]!.url).toBe('https://shop.example.com/jsonapi/product-variations/test_bundle/vb1?include=bundle_items.variation');
    expect(bundle.bundle_discount).toBe(10);
    expect(isVariationBundle(bundle)).toBe(true);

    const lines = bundleItems(bundle);
    // bi2 is disabled; bi3 was not included.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 2, unitPrice: price('30.00'), item: { title: '2x Cleanser' }, variation: { sku: 'CLEAN' } });
    expectTypeOf(lines[0]!.variation).toEqualTypeOf<ProductVariation | null>();
  });

  it('keeps an item whose variation was not included, without it', () => {
    const bundle = {
      bundle_items: [{ id: 'bi1', type: 'bundle-item--default', title: '2x Cleanser', status: true, quantity: '2.00', price: null, variation: { id: 'v1', type: 'product-variation--default', stub: true } }],
    } as Pick<VariationBundle, 'bundle_items'>;
    expect(bundleItems(bundle)).toEqual([{ item: bundle.bundle_items[0], variation: null, quantity: 2, unitPrice: null }]);
  });

  it('tells bundles from plain variations', () => {
    expect(isVariationBundle({ id: 'v1', type: 'product-variation--default', sku: 'X' })).toBe(false);
    expect(isVariationBundle(null)).toBe(false);
  });

  it('types and routes bundle items', async () => {
    const { fetch, calls } = mockFetch(json({ data: [] }));
    const drupal = withCommerceApi(new JsonApiClient({ baseUrl: 'https://shop.example.com', fetch }));
    const items = await drupal.getCollection('bundle-item--default');
    expectTypeOf(items).toEqualTypeOf<Array<BundleItem & Resource>>();
    expect(calls[0]!.url).toBe('https://shop.example.com/jsonapi/bundle-items/default');
  });

  it('adds a bundle to the cart like any variation', async () => {
    const { fetch, calls } = mockFetch(json({ data: [] }));
    await new CommerceApi(new JsonApiClient({ baseUrl: 'https://shop.example.com', fetch })).addToCart({ type: 'product-variation--test_bundle', id: 'vb1' });
    expect(calls[0]!.body).toEqual({ data: [{ type: 'product-variation--test_bundle', id: 'vb1', meta: {} }] });
  });
});

describe('other commerce entity types', () => {
  it('resolves paths for entity types projects add', async () => {
    const resolve = createCommerceApiResourcePath(['license', 'wishlist-item']);
    expect(resolve('license--software')).toBe('/licenses/software');
    expect(resolve('wishlist-item--default')).toBe('/wishlist-items/default');
    expect(resolve('product--default')).toBe('/products/default');
    expect(resolve('node--article')).toBeUndefined();

    const { fetch, calls } = mockFetch(json({ data: [] }));
    const commerce = new CommerceApi(new JsonApiClient({ baseUrl: 'https://shop.example.com', fetch }), { entityTypes: ['license'] });
    await commerce.client.getCollection('license--software');
    expect(calls[0]!.url).toBe('https://shop.example.com/jsonapi/licenses/software');
  });
});
