// Prices and menu options now live in lib/menu/catalog.js, which is the single
// place a new category is added. Only genuinely cross-cutting constants belong
// here — catalog.js imports this file, so nothing here may import the catalog.
export const TAX_RATE = 0.0825;

// The customer-facing Cash App payment link shown on /order/online — separate
// from the staff-only cashtag picker at /cashapp (which only ever affects the
// tag embedded in a *printed receipt's* QR code, stored in that browser's
// localStorage and not readable from the customer's device). Same default tag
// as print-server.js's CASHAPP_URL, so an unconfigured shop is consistent
// everywhere.
export const CASHAPP_URL = process.env.NEXT_PUBLIC_CASHAPP_URL || 'https://cash.app/$TheMoonTea';
