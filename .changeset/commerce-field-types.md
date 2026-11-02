---
"@jsondrop/commerce": minor
---

New `Measurement`, `Dimensions`, `ShipmentItem`, `TaxNumberField`, `PluginItemField` and `RemoteIdField` types. The entity types gain the matching optional fields: `weight` and `dimensions` on variations, `items`, `weight`, `original_amount` and `adjustments` on shipments, `adjustments` on orders and order items, and `tax_number` on profiles.

New generic `Profile<TBundle>`, registered for every `profile--*` resource, with `CustomerProfile` built on it. `Order.billing_profile` and `Shipment.shipping_profile` are typed for sites where JSON:API Extras enables them.

Fixes `order_total.adjustments`, now `OrderTotalAdjustment[]`: its `percentage` is a number and `total` is always there. `Adjustment`, the shape of the `adjustments` field, keeps `percentage` as a string and loses `total`, which that field never sends.
