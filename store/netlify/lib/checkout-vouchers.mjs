/**
 * ImamStore checkout voucher policy — Tahap 1.2 (SERVER ONLY).
 * Snapshot from storefront V43, 27 Nov 2026. This is NOT a browser export.
 * Do not treat client-side voucher labels or discounts as authoritative.
 * DISKON10's cap of Rp500 is retained verbatim from V43; verify policy with owner.
 * Usage limits are NOT checked here; the quote engine requires trusted entitlement
 * checks supplied by server transaction in the later endpoint phase.
 */
export const CHECKOUT_VOUCHER_POLICY_VERSION = 'v43-2026-11-27';

export const CHECKOUT_VOUCHERS = Object.freeze([
  Object.freeze({ code: 'BELANJA50', name: 'Voucher Belanja', type: 'product_fixed', discount: 5000,
    minimumSubtotal: 500000, maxDiscount: null, expiresOn: '2026-12-31', maxUsesPerAccount: 5 }),
  Object.freeze({ code: 'DISKON10', name: 'Diskon Produk 10%', type: 'product_percent', discount: 10,
    minimumSubtotal: 100000, maxDiscount: 500, expiresOn: '2026-12-31', maxUsesPerAccount: 5 }),
  Object.freeze({ code: 'ONGKIR5', name: 'Diskon Ongkir', type: 'shipping_fixed', discount: 5000,
    minimumSubtotal: 500000, maxDiscount: null, expiresOn: '2026-12-31', maxUsesPerAccount: 5 }),
]);
