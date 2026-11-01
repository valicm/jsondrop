# @jsondrop/commerce

Drupal Commerce types and a client for the
[commerce_api](https://www.drupal.org/project/commerce_api) module: cart,
coupons, checkout, shipping and payment.

```sh
npm install @jsondrop/core @jsondrop/drupal @jsondrop/commerce
```

Needs `commerce_api` (8.x-1.x) on the Drupal side.

## Catalog

commerce_api renames Commerce's resource types: the `commerce_` prefix
goes and underscores become hyphens, and the paths are pluralized.

| Drupal | Resource type | Path |
|---|---|---|
| `commerce_product` (default) | `product--default` | `/jsonapi/products/default` |
| `commerce_product_variation` (default) | `product-variation--default` | `/jsonapi/product-variations/default` |
| `commerce_order` (default) | `order--default` | `/jsonapi/orders/default` |
| `commerce_order_item` (default) | `order-item--default` | `/jsonapi/order-items/default` |
| `commerce_store` (online) | `store--online` | `/jsonapi/stores/online` |
| `commerce_promotion_coupon` | `promotion-coupon` | `/jsonapi/promotion-coupons` |

**JSON:API Extras overrides the renaming.** On a site with Extras, types
keep Drupal's names (`commerce_product_variation--default`) unless its
resource configs say otherwise, and sites mix both. The types accept both
namings; for paths, use `client.withDiscoveredPaths()`; for the type names
`CommerceApi` sends, set `naming: 'drupal'` (and pass orders rather than
IDs, so their own type is sent).

`withCommerceApi(client)` gives a client that resolves those paths, and the
types are registered by entity type, so every product bundle is a
`Product`, every variation a `ProductVariation`, and so on:

```ts
import { JsonApiClient } from '@jsondrop/core';
import { withCommerceApi } from '@jsondrop/commerce';

const drupal = withCommerceApi(new JsonApiClient({ baseUrl: 'https://shop.example.com' }));
const products = await drupal.getCollection('product--default', { query: { include: ['variations'] } });
products[0].variations; // ProductVariation[], with resolved_price
```

## Cart and checkout

```ts
import { CommerceApi, checkoutStatus, createCartToken } from '@jsondrop/commerce';

const commerce = new CommerceApi(drupal).withCartToken(token ?? createCartToken());

await commerce.addToCart({ type: 'product-variation--default', id: variationId, quantity: 2 });
const [cart] = await commerce.getCarts();
await commerce.applyCoupons(cart.id, 'SAVE10');

await commerce.updateCheckout(cart.id, {
  email: 'ana@example.com',
  billing_information: { address: { country_code: 'HR', locality: 'Zagreb', postal_code: '10000', address_line1: 'Ilica 1' } },
});
const { constraints, shippingRates, paymentOptions, ready } = checkoutStatus(await commerce.getCheckout(cart.id));
```

| Method | Endpoint |
|---|---|
| `getCurrentStore()` | `GET /current-store` |
| `getCarts()`, `getCart(id)` | `GET /carts`, `GET /carts/{order}` |
| `addToCart(items)` | `POST /cart/add` |
| `updateCartItem(order, item, { quantity })` | `PATCH /carts/{order}/items/{item}` |
| `removeCartItems(order, items)` | `DELETE /carts/{order}/items` |
| `clearCart(order)` | `DELETE /carts/{order}` |
| `applyCoupons(order, codes)`, `removeCoupons(order)` | `PATCH` / `DELETE /carts/{order}/coupons` |
| `getCheckout(order)`, `updateCheckout(order, changes)` | `GET` / `PATCH /checkout/{order}` |
| `getShippingMethods(order)` | `GET /checkout/{order}/shipping-methods` |
| `createPayment(order, { gatewayId })` | `POST /checkout/{order}/payment` |
| `approvePayment(order, params)` | `GET /checkout/{order}/payment/approve` (offsite return) |

**Orders** can be passed as an ID or as the order itself (`getCarts()`
returns them); with the order, requests that send its type use the real one
(`order--regular`, not the configured default).

**Your own models.** Methods are generic and typed with the package's types
by default. If you map responses to models of your own, take them untyped:
`commerce.getCarts<Resource>()`.

**Cart token.** commerce_api never issues one: the client makes one up
(`createCartToken()`) and sends it as `Commerce-Cart-Token`; carts created
under it belong to whoever holds it. Keep it in an httpOnly cookie and call
Drupal from the server. See [example 6](../../examples/06-server-cart-token.ts).

**Payments.** `createPayment` pays the order's balance with its payment
instrument (onsite and manual gateways) and places the order. It returns
the whole response, so a gateway module that answers with an extra step
can be handled by the caller. Offsite gateways redirect the customer, and
`approvePayment` completes the payment on their return.

## Product bundles

For [commerce_variation_bundle](https://www.drupal.org/project/commerce_variation_bundle):
a variation type with the "variation bundle" trait holds bundle items
(`bundle-item--{type}`), each a quantity of another variation.

```ts
import { bundleItems, type VariationBundle } from '@jsondrop/commerce';

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'product-variation--bundle': VariationBundle<'bundle'>;
  }
}

const set = await drupal.getResource('product-variation--bundle', id, {
  query: { include: ['bundle_items.variation'] },
});
set.bundle_discount; // percentage off the items
for (const { variation, quantity, unitPrice } of bundleItems(set)) {
  // enabled items, with their variation and its resolved unit price
}
```

`isVariationBundle(variation)` tells bundles from plain variations. Add a
bundle to the cart like any variation; the module prices it from its items.

## Other Commerce modules

commerce_api renames every `commerce_*` entity type, contrib ones too.
`COMMERCE_ENTITY_TYPES` lists the ones path resolution knows (Commerce,
commerce_shipping, commerce_variation_bundle); add others in commerce_api's
naming:

```ts
const drupal = withCommerceApi(client, ['license', 'wishlist-item']);
// or
const commerce = new CommerceApi(client, { entityTypes: ['license'] });
```

## Extending

- Your bundles and fields: [example 4](../../examples/04-commerce-types.ts).
- Your modules' endpoints, headers and payment flows: subclass `CommerceApi`,
  [example 5](../../examples/05-commerce-subclass.ts).
- Other names: `orderType`, `couponType`, `paymentType` and `cartInclude`
  options.
