/**
 * Commerce entity types as commerce_api names them (the `commerce_` prefix
 * dropped, underscores hyphenated): Commerce core and its submodules, plus
 * common contrib.
 *
 * commerce_api renames every `commerce_*` entity type, contrib ones
 * included; add others with {@link createCommerceApiResourcePath}.
 */
export const COMMERCE_ENTITY_TYPES: readonly string[] = [
  // Commerce core.
  'currency',
  'log',
  'order',
  'order-item',
  'order-item-type',
  'order-type',
  'payment',
  'payment-gateway',
  'payment-method',
  'product',
  'product-attribute',
  'product-attribute-value',
  'product-type',
  'product-variation',
  'product-variation-type',
  'promotion',
  'promotion-coupon',
  'store',
  'store-type',
  'tax-type',
  // commerce_shipping.
  'package-type',
  'shipment',
  'shipment-type',
  'shipping-method',
  // commerce_variation_bundle.
  'bundle-item',
  'bundle-item-type',
];

/**
 * A path resolver for commerce_api's renamed types, knowing
 * {@link COMMERCE_ENTITY_TYPES} plus `extraEntityTypes`: other `commerce_*`
 * entity types from contrib or custom modules, in commerce_api's naming
 * (`commerce_license` → `license`).
 */
export function createCommerceApiResourcePath(extraEntityTypes: readonly string[] = []): (type: string) => string | undefined {
  const known = new Set([...COMMERCE_ENTITY_TYPES, ...extraEntityTypes]);
  return (type) => {
    const [entityType, bundle] = type.split('--') as [string, string | undefined];
    if (!known.has(entityType)) {
      return undefined;
    }
    return bundle ? `/${entityType}s/${bundle}` : `/${entityType}s`;
  };
}

/**
 * Path of a commerce_api resource type: the entity type pluralized, then
 * the bundle (`product-variation--default` → `/product-variations/default`,
 * `promotion-coupon` → `/promotion-coupons`). `undefined` for other types.
 *
 * Pass it as the client's `resolveResourcePath`; `withCommerceApi()` does.
 */
export const commerceApiResourcePath = createCommerceApiResourcePath();
