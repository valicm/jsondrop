# @jsondrop/commerce

## 0.3.0

### Minor Changes

- 56dd104: Add `PromoBar` for commerce_promo_bar's `promo-bar` resource, and `ColorField` for the Color Field module's `color_field_type`. `promo-bar` resolves to `/promo-bars`.

## 0.2.0

### Minor Changes

- 64a4743: New `Measurement`, `Dimensions`, `ShipmentItem`, `TaxNumberField`, `PluginItemField` and `RemoteIdField` types. The entity types gain the matching optional fields: `weight` and `dimensions` on variations, `items`, `weight`, `original_amount` and `adjustments` on shipments, `adjustments` on orders and order items, and `tax_number` on profiles.
  
  New generic `Profile<TBundle>`, registered for every `profile--*` resource, with `CustomerProfile` built on it. `Order.billing_profile` and `Shipment.shipping_profile` are typed for sites where JSON:API Extras enables them.
  
  Fixes `order_total.adjustments`, now `OrderTotalAdjustment[]`: its `percentage` is a number and `total` is always there. `Adjustment`, the shape of the `adjustments` field, keeps `percentage` as a string and loses `total`, which that field never sends.

### Patch Changes

- Updated dependencies [64a4743]
- Updated dependencies [64a4743]
  - @jsondrop/core@0.2.1
  - @jsondrop/drupal@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [bd518de]
  - @jsondrop/core@0.2.0
  - @jsondrop/drupal@0.1.2

## 0.1.0

### Minor Changes

- 24490a4: First release.
  
  - `@jsondrop/core`: a typed JSON:API client for Drupal with no dependencies. Includes a query builder, deserializer, resource type registry, path discovery, and auth strategies: bearer token, basic, session cookie, OAuth client credentials, and OAuth user login with PKCE and refresh tokens.
  - `@jsondrop/drupal`: Drupal 11 core entity types and helpers for decoupled_router, menus, views, images, the current user and session login.
  - `@jsondrop/commerce`: Drupal Commerce types and a commerce_api client covering the cart, coupons, checkout, shipping and payments, plus commerce_variation_bundle support.

### Patch Changes

- Updated dependencies [24490a4]
  - @jsondrop/core@0.1.0
  - @jsondrop/drupal@0.1.0
