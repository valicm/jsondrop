/**
 * Example 4: typing a store's catalog and orders.
 *
 * Commerce types are extended like content types. commerce_api renames the
 * resource types (`commerce_product_variation--clothing` is
 * `product-variation--clothing`), so register them under those names.
 */
import type { ToMany, ToOne } from '@jsondrop/core';
import type { File, ImageMeta, MediaImage, TextField } from '@jsondrop/drupal';
import {
  bundleItems,
  type Order,
  type OrderItem,
  type Price,
  type Product,
  type ProductAttributeValue,
  type ProductVariation,
  type VariationBundle,
} from '@jsondrop/commerce';

// Product attributes: one type per attribute, with its own fields.
export interface Color extends ProductAttributeValue<'color'> {
  field_hex: string;
}

export type Size = ProductAttributeValue<'size'>;

// Variations: attribute fields are named `attribute_{attribute}`.
export interface ClothingVariation extends ProductVariation<'clothing'> {
  attribute_color: ToOne<Color>;
  attribute_size: ToOne<Size>;
  field_images: ToMany<File<ImageMeta>>;
  /** A computed field a site module adds. */
  stock_level?: { available: number; in_stock: boolean };
}

export interface Clothing extends Product<'clothing'> {
  body: TextField | null;
  field_media: ToMany<MediaImage>;
  variations: ToMany<ClothingVariation>;
}

// A second product type with a price field of its own.
export interface GiftCardVariation extends ProductVariation<'gift_card'> {
  field_face_value: Price;
}

// Product bundles (commerce_variation_bundle): a variation type with the
// "variation bundle" trait holds bundle items, each a quantity of another
// variation. Extend VariationBundle like any variation.
export interface OutfitVariation extends VariationBundle<'outfit'> {
  field_images: ToMany<File<ImageMeta>>;
}

export interface Outfit extends Product<'outfit'> {
  variations: ToMany<OutfitVariation>;
}

/** An outfit's contents, for a "What's in the set" list. */
export function outfitContents(outfit: OutfitVariation) {
  // Read with `include: ['variations.bundle_items.variation']`.
  return bundleItems<ClothingVariation>(outfit).map((line) => ({
    title: line.variation?.title ?? line.item.title,
    quantity: line.quantity,
    color: line.variation?.attribute_color && !('stub' in line.variation.attribute_color) ? line.variation.attribute_color.name : null,
    unitPrice: line.unitPrice?.formatted ?? null,
  }));
}

// Orders and items with fields the site added.
export interface WebOrderItem extends OrderItem<'default'> {
  field_gift_message?: string | null;
  purchased_entity: ToOne<ClothingVariation | GiftCardVariation | OutfitVariation>;
}

export interface WebOrder extends Order<'default'> {
  field_newsletter_opt_in?: boolean;
  order_items: ToMany<WebOrderItem>;
}

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'product--clothing': Clothing;
    'product-variation--clothing': ClothingVariation;
    'product-variation--gift_card': GiftCardVariation;
    'product--outfit': Outfit;
    'product-variation--outfit': OutfitVariation;
    'product-attribute-value--color': Color;
    'product-attribute-value--size': Size;
    'order--default': WebOrder;
    'order-item--default': WebOrderItem;
  }
}
