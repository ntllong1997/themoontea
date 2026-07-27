// Prices and menu options now live in lib/menu/catalog.js, which is the single
// place a new category is added. Only genuinely cross-cutting constants belong
// here — catalog.js imports this file, so nothing here may import the catalog.
export const TAX_RATE = 0.0825;
