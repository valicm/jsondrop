import { isStub, type ResourceBase, type ToMany, type ToOne } from '@jsondrop/core';
import type { DateTimeString } from '@jsondrop/drupal';
import type { ProductVariation } from './entities.js';
import type { Price } from './fields.js';

/**
 * Product bundles from the commerce_variation_bundle module.
 *
 * A bundle is a product variation whose type has the "variation bundle"
 * trait: it holds bundle items, each a quantity of another variation. The
 * bundle is added to the cart like any variation; the module prices it from
 * its items and can split it into its items once the order is placed.
 *
 * Register your bundle variation types:
 *
 * ```ts
 * declare module '@jsondrop/core' {
 *   interface ResourceTypes {
 *     'product-variation--bundle': VariationBundle<'bundle'>;
 *   }
 * }
 * ```
 *
 * and include the items when reading:
 * `include: ['variations.bundle_items.variation']`.
 */

/** `commerce_bundle_item`: a quantity of one variation inside a bundle. */
export interface BundleItem<TBundle extends string = string> extends ResourceBase<`bundle-item--${TBundle}` | `commerce_bundle_item--${TBundle}`> {
  langcode?: string;
  /** Generated as `{quantity}x {variation title}` by default. */
  title: string;
  status: boolean;
  /** A decimal, as a string: `"2.00"`. */
  quantity: string;
  /**
   * The variation's unit price, resolved for the current store and user
   * and the item's quantity (tiered prices apply). A computed field, so
   * sites with JSON:API Extras may not expose it.
   */
  price?: Price | null;
  created?: DateTimeString;
  changed?: DateTimeString;
  variation: ToOne<ProductVariation>;
}

/** A product variation with the variation bundle trait. */
export interface VariationBundle<TBundle extends string = string> extends ProductVariation<TBundle> {
  bundle_items: ToMany<BundleItem>;
  /** Percentage off the items' prices; 0 uses the regular price. */
  bundle_discount: number | null;
  /** Split into the bundle's items once the order is placed. */
  bundle_split: boolean;
}

/** Whether a variation is a bundle (has bundle items). */
export function isVariationBundle(variation: unknown): variation is VariationBundle {
  return typeof variation === 'object' && variation !== null && Array.isArray((variation as VariationBundle).bundle_items);
}

export interface BundleLine<TVariation extends ProductVariation = ProductVariation> {
  item: BundleItem;
  /** The bundled variation; NULL when it was not included. */
  variation: TVariation | null;
  quantity: number;
  unitPrice: Price | null;
}

/**
 * A bundle's enabled items with their variations, in order. Items that were
 * not included are skipped: include `bundle_items.variation` to get them all.
 */
export function bundleItems<TVariation extends ProductVariation = ProductVariation>(bundle: Pick<VariationBundle, 'bundle_items'>): BundleLine<TVariation>[] {
  return bundle.bundle_items
    .filter((item): item is BundleItem => !isStub(item))
    .filter((item) => item.status !== false)
    .map((item) => ({
      item,
      variation: item.variation && !isStub(item.variation) ? (item.variation as TVariation) : null,
      quantity: Number(item.quantity),
      unitPrice: item.price ?? null,
    }));
}

declare module '@jsondrop/core' {
  interface EntityTypes {
    'bundle-item': BundleItem;
    commerce_bundle_item: BundleItem;
  }
}
