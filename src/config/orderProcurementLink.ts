/**
 * Feature gate: manual order reference (manual_ref) + item-level supplier
 * linking + sales-order → purchase-order creation.
 *
 * Built exclusively for the Bellona tenant at the owner's request — it must
 * NOT appear for any other account. Gate every UI surface of this feature
 * set through isOrderProcurementLinkEnabled().
 *
 * The id below is the Bellona company owner (companies.owner_id). Team
 * members of Bellona are covered by resolving useDataOwnerId() first.
 */
const ORDER_PROCUREMENT_LINK_OWNERS: ReadonlySet<string> = new Set([
  "1042ca69-b091-4dc4-8722-34b326fdc9cb", // Bellona
]);

export function isOrderProcurementLinkEnabled(ownerId?: string | null): boolean {
  return !!ownerId && ORDER_PROCUREMENT_LINK_OWNERS.has(ownerId);
}
