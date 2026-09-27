// What the shop sells, and how each item behaves.
//
// The menu is split in two:
//   - editable DATA (names, prices, choices, order, shown/hidden) — admins
//     change it on /menu; it is stored in Supabase and ships with a built-in
//     copy in defaultMenu.js;
//   - code BEHAVIOUR (colours, prep flows, station screens, conditional
//     add-ons) — CATEGORY_BEHAVIOURS below, keyed by category `key`.
// `buildMenu` joins the two. Pages get the live result from useMenu().
//
// `key` is the string persisted as an order row's `type`. The iPad app mirrors
// this in MenuCatalog.swift — keep the behaviour and colour palette in sync.
//
// Relative import (not the "@/" alias) so this module can be unit tested under
// plain `node --test`, without the Next.js path-alias resolver.
import { TAX_RATE } from '../constants.js';
import { DEFAULT_MENU_CONFIG } from './defaultMenu.js';

export { TAX_RATE };

/**
 * A category's option group. `role` decides where the chosen value ends up on
 * the cart line:
 *   'name'     -> joined with the other 'name' groups to form the base name
 *   'modifier' -> emitted as a modifier, so it renders as "Base (Value)"
 *
 * An option is either a plain string, or `{ value, price }` when the choice
 * itself carries the price — sides, where a water and a soda cost different
 * amounts under one category.
 *
 * @typedef {string | { value: string, price: number }} Option
 * @typedef {{ key: string, label: string, options: Option[], role: 'name'|'modifier' }} OptionGroup
 */

/** @param {Option} option */
export const optionValue = (option) => (typeof option === 'string' ? option : option.value);

/** @param {Option} option @returns {number} 0 unless the option is priced itself */
export const optionPrice = (option) => (typeof option === 'string' ? 0 : option.price ?? 0);

const findOption = (group, value) =>
    group.options.find((option) => optionValue(option) === value);

/**
 * An optional extra. `appliesWhen` gates BOTH whether the toggle is offered and
 * whether its price counts, so a stale toggle can never inflate the price after
 * the selection it depended on has changed.
 *
 * @typedef {{ key: string, label: (selection: object) => string|undefined,
 *             price: number, appliesWhen: (selection: object) => boolean }} AddOn
 */

/**
 * A per-unit prep status. `next` wires the click-to-advance cycle; the rest is
 * presentation. Tailwind class names must stay literal so the JIT sees them.
 *
 * @typedef {{ next: string, badge: string, tooltip: string, className: string }} FlowState
 */

/** Drinks that offer a "hold the other flavour" tweak, and what to call it. */
const DRINK_CUSTOMIZATIONS = {
    'Matcha Strawberry': 'Only Matcha',
    'Golden Taro': 'Only Taro',
};

// Every category owns a distinct hue, and no state is lighter than the -100
// tint — a unit must never look like blank space on a busy history screen.
// Tailwind only generates classes it can read verbatim, so these stay literal
// (and lib/ is in the content globs in tailwind.config.mjs).

const CORNDOG_FLOW = {
    initial: 'received',
    states: {
        received: { next: 'making', badge: 'New', tooltip: 'Click to mark as Making', className: 'bg-red-100 text-red-900' },
        making: { next: 'ready', badge: 'Making…', tooltip: 'Click to mark as Ready', className: 'bg-red-200 text-red-900' },
        ready: { next: 'pickedup', badge: 'Ready ✓', tooltip: 'Click to mark as Picked Up', className: 'bg-red-300 text-red-900' },
        pickedup: { next: 'received', badge: 'Picked Up ✓', tooltip: 'Click to reset', className: 'bg-red-600 text-white' },
    },
};

const BOBA_FLOW = {
    initial: 'new',
    states: {
        new: { next: 'ready', badge: 'New', tooltip: 'Click to mark as Ready', className: 'bg-blue-200 text-blue-900' },
        ready: { next: 'pickedup', badge: 'Ready ✓', tooltip: 'Click to mark as Picked Up', className: 'bg-blue-300 text-blue-900' },
        pickedup: { next: 'new', badge: 'Picked Up ✓', tooltip: 'Click to reset', className: 'bg-blue-600 text-white' },
    },
};

/**
 * The New -> Picked Up flow used by counter items that need no prep tracking.
 *
 * Class names are passed in as literals rather than composed from an accent
 * name, because Tailwind's JIT only sees class strings it can read verbatim in
 * the source.
 */
const twoStepFlow = (newClass, doneClass) => ({
    initial: 'new',
    states: {
        new: { next: 'pickedup', badge: 'New', tooltip: 'Click to mark as Picked Up', className: newClass },
        pickedup: { next: 'new', badge: 'Picked Up ✓', tooltip: 'Click to reset', className: doneClass },
    },
});

/**
 * The neutral default, and what an unknown category falls back to. Give a new
 * category its own colours instead if you want it distinguishable in history.
 */
// Neutral grey on purpose: an unrecognised category should read as "this build
// doesn't know what this is", not blend in with a real one.
export const SIMPLE_FLOW = twoStepFlow('bg-slate-200 text-slate-900', 'bg-slate-600 text-white');

const COOKIE_FLOW = twoStepFlow('bg-amber-200 text-amber-900', 'bg-amber-600 text-white');
const LEMONADE_FLOW = twoStepFlow('bg-cyan-200 text-cyan-900', 'bg-cyan-600 text-white');
const EGG_ROLL_FLOW = twoStepFlow('bg-purple-200 text-purple-900', 'bg-purple-600 text-white');
const SIDE_FLOW = twoStepFlow('bg-pink-200 text-pink-900', 'bg-pink-600 text-white');
const SPIRO_PAPA_FLOW = twoStepFlow('bg-orange-200 text-orange-900', 'bg-orange-600 text-white');

/**
 * A coupon line written by the iPad till. It is a real line type that shows up
 * in history and in the summary, but it is not something staff can order, so
 * `orderable: false` keeps it out of the order panel.
 */
const DISCOUNT_FLOW = {
    initial: 'applied',
    states: {
        applied: { next: 'applied', badge: 'Coupon', tooltip: '', className: 'bg-green-100 text-green-800' },
    },
};

// Spare colours for categories created in the menu editor, which have no
// entry in CATEGORY_BEHAVIOURS. A key always hashes to the same colour, on
// every device — MenuCatalog.swift uses the same hash and palette order.
const EXTRA_FLOWS = [
    twoStepFlow('bg-lime-200 text-lime-900', 'bg-lime-600 text-white'),
    twoStepFlow('bg-teal-200 text-teal-900', 'bg-teal-600 text-white'),
    twoStepFlow('bg-indigo-200 text-indigo-900', 'bg-indigo-600 text-white'),
    twoStepFlow('bg-fuchsia-200 text-fuchsia-900', 'bg-fuchsia-600 text-white'),
    twoStepFlow('bg-rose-200 text-rose-900', 'bg-rose-600 text-white'),
    twoStepFlow('bg-sky-200 text-sky-900', 'bg-sky-600 text-white'),
    twoStepFlow('bg-emerald-200 text-emerald-900', 'bg-emerald-600 text-white'),
    twoStepFlow('bg-violet-200 text-violet-900', 'bg-violet-600 text-white'),
];

/**
 * The half of a category that is code rather than editable data, keyed by the
 * category `key` in lib/menu/defaultMenu.js. A category the editor creates has
 * no entry and gets the defaults in `toCategory`.
 *
 * An add-on's `appliesWhen` names an option value, so renaming that option in
 * the editor (e.g. "Potato") quietly stops offering the add-on — it never
 * charges for it wrongly.
 */
const CATEGORY_BEHAVIOURS = {
    Corndog: {
        addOns: [
            {
                key: 'dust',
                label: () => 'Hot Cheeto Dust',
                price: 1.0,
                appliesWhen: (selection) => selection.outside === 'Potato',
            },
        ],
        flow: CORNDOG_FLOW,
        station: { slug: 'corndog', title: '🌭 Corndog Station', accentClass: 'text-orange-600' },
    },
    Boba: {
        layout: 'columns',
        addOns: [
            {
                key: 'customization',
                label: (selection) => DRINK_CUSTOMIZATIONS[selection.drink],
                price: 0,
                appliesWhen: (selection) => Boolean(DRINK_CUSTOMIZATIONS[selection.drink]),
            },
        ],
        flow: BOBA_FLOW,
        station: { slug: 'drink', title: '🧋 Drink Station', accentClass: 'text-blue-600' },
    },
    Cookie: { flow: COOKIE_FLOW },
    Lemonade: { flow: LEMONADE_FLOW },
    'Egg Roll': { flow: EGG_ROLL_FLOW },
    'Spiro Papa': { flow: SPIRO_PAPA_FLOW },
    Side: { flow: SIDE_FLOW },
};

/**
 * Coupon lines written by the till. A real line type that shows up in history
 * and the summary, but neither orderable nor editable, so `buildMenu` always
 * appends it rather than storing it with the menu.
 */
const DISCOUNT_CATEGORY = Object.freeze({
    key: 'Discount',
    label: 'Discount',
    orderable: false,
    price: 0,
    layout: 'rows',
    optionGroups: [],
    addOns: [],
    flow: DISCOUNT_FLOW,
    station: null,
});

/** Keys the editor may not give a category, because code already owns them. */
export const RESERVED_CATEGORY_KEYS = Object.freeze([DISCOUNT_CATEGORY.key]);

/** Stable 32-bit string hash over code points; mirrored in MenuCatalog.swift. */
export const hashKey = (key) =>
    [...key].reduce((hash, ch) => (Math.imul(hash, 31) + ch.codePointAt(0)) >>> 0, 0);

/**
 * A category's prep flow. It depends on the key alone — no loaded menu — so
 * history can colour any row, including one from a category that has since
 * been hidden, or one this build has never seen.
 */
export function flowFor(type) {
    if (type === DISCOUNT_CATEGORY.key) return DISCOUNT_FLOW;
    const builtIn = CATEGORY_BEHAVIOURS[type]?.flow;
    if (builtIn) return builtIn;
    if (typeof type !== 'string' || type === '') return SIMPLE_FLOW;
    return EXTRA_FLOWS[hashKey(type) % EXTRA_FLOWS.length];
}

/** Editable config + code behaviour -> the category shape the app renders. */
function toCategory(config) {
    const behaviour = CATEGORY_BEHAVIOURS[config.key] ?? {};
    return Object.freeze({
        key: config.key,
        label: config.label,
        orderable: config.visible,
        price: config.price,
        layout: behaviour.layout ?? 'rows',
        optionGroups: config.optionGroups,
        addOns: behaviour.addOns ?? [],
        flow: flowFor(config.key),
        station: behaviour.station ?? null,
    });
}

/**
 * Build the menu the app renders from an (already validated) menu config.
 * A hidden category stays in `categories` so history and the summary still
 * label its old orders; it only drops out of `orderableCategories`.
 *
 * @param {import('./defaultMenu.js').MenuConfig} config
 */
export function buildMenu(config) {
    const categories = [...config.categories.map(toCategory), DISCOUNT_CATEGORY];
    const byKey = new Map(categories.map((category) => [category.key, category]));

    return Object.freeze({
        categories,
        orderableCategories: categories.filter((c) => c.orderable),
        categoryKeys: categories.map((c) => c.key),
        categoryFor: (type) => byKey.get(type),
    });
}

// ── The built-in menu ────────────────────────────────────────────────────────
//
// What ships in the app. Pages render the LIVE menu from useMenu(); these
// exports serve tests and the station screens, whose categories are
// code-owned anyway.

export const DEFAULT_MENU = buildMenu(DEFAULT_MENU_CONFIG);

export const CATEGORIES = DEFAULT_MENU.categories;

/** @returns {object|undefined} the built-in category a type belongs to */
export const categoryFor = DEFAULT_MENU.categoryFor;

/** Categories that have their own prep screen, in menu order. */
export const STATION_CATEGORIES = CATEGORIES.filter((c) => c.station);

const BY_SLUG = new Map(STATION_CATEGORIES.map((c) => [c.station.slug, c]));

/** @returns {object|undefined} the category served by a /order/<slug> station */
export const categoryForSlug = (slug) => BY_SLUG.get(slug);

export const ORDERABLE_CATEGORIES = DEFAULT_MENU.orderableCategories;

export const CATEGORY_KEYS = DEFAULT_MENU.categoryKeys;

// ── Per-unit status ──────────────────────────────────────────────────────────

/**
 * Resolve a unit's flow state, tolerating a `type` this build does not know
 * (an order placed by a newer client) so history still renders instead of
 * throwing.
 */
export function flowStateFor(type, state) {
    const flow = flowFor(type);
    return flow.states[state] ?? flow.states[flow.initial];
}

/** The state a freshly-seen unit of this type starts in. */
export const initialStateFor = (type) => flowFor(type).initial;

/** The state that follows `state` when a unit is clicked. */
export const nextStateFor = (type, state) => flowStateFor(type, state).next;

// ── Selection -> cart line ───────────────────────────────────────────────────

/** An empty selection for a category: every option group unset, add-ons off. */
export function emptySelection(category) {
    const groups = Object.fromEntries(category.optionGroups.map((g) => [g.key, '']));
    const addOns = Object.fromEntries(category.addOns.map((a) => [a.key, false]));
    return { ...groups, addOns };
}

/**
 * True once every option group holds a value that is still on the menu — a
 * selection made before the menu was edited cannot slip in a removed option.
 */
export function isSelectionComplete(category, selection) {
    return category.optionGroups.every((group) =>
        Boolean(selection?.[group.key]) && findOption(group, selection[group.key]) !== undefined
    );
}

/**
 * The add-ons currently offered for a selection, each with its resolved label.
 * An add-on whose `appliesWhen` is false is neither shown nor charged.
 */
export function activeAddOns(category, selection) {
    return category.addOns
        .filter((addOn) => addOn.appliesWhen(selection))
        .map((addOn) => ({ ...addOn, resolvedLabel: addOn.label(selection) }))
        .filter((addOn) => Boolean(addOn.resolvedLabel));
}

/**
 * Selection -> the cart-line shape `toOrderRows` expects:
 * `{ name, modifiers, price, type }`.
 *
 * Base name is the 'name' groups joined by a space; modifiers are the
 * 'modifier' groups followed by any checked-and-applicable add-ons. Add-on
 * price is only charged while `appliesWhen` still holds, so switching a corndog
 * away from Potato drops both the toggle and its dollar.
 *
 * @returns {{name: string, modifiers: string[], price: number, type: string}|null}
 */
export function buildCartLine(category, selection) {
    if (!category.orderable) return null;
    if (!isSelectionComplete(category, selection)) return null;

    // A category with no name-role groups (a pack-only cookie, a plain egg
    // roll) is named after itself, so its choice reads as "Cookie (3 for $14)"
    // rather than colliding with a same-named item in another category.
    const nameGroups = category.optionGroups.filter((group) => group.role === 'name');
    const name = nameGroups.length > 0
        ? nameGroups.map((group) => selection[group.key]).join(' ')
        : category.label;

    const optionModifiers = category.optionGroups
        .filter((group) => group.role === 'modifier')
        .map((group) => selection[group.key]);

    const checked = activeAddOns(category, selection).filter(
        (addOn) => selection.addOns[addOn.key]
    );

    // A chosen option can carry its own price (a $1 water vs a $2 soda under
    // one Side category); for a flat-priced category every option adds 0.
    const optionsTotal = category.optionGroups.reduce((sum, group) => {
        const chosen = findOption(group, selection[group.key]);
        return sum + (chosen ? optionPrice(chosen) : 0);
    }, 0);

    const addOnsTotal = checked.reduce((sum, addOn) => sum + addOn.price, 0);

    return {
        name,
        modifiers: [...optionModifiers, ...checked.map((a) => a.resolvedLabel)],
        price: category.price + optionsTotal + addOnsTotal,
        type: category.key,
    };
}

/**
 * What to show in the panel header. A category whose options carry their own
 * prices shows the range they span rather than a misleading base of $0.00.
 */
export function priceLabelFor(category) {
    const money = (value) => `$${value.toFixed(2)}`;

    // An option group is required, so its cheapest option is the floor — not 0.
    // Only an empty group contributes nothing.
    const perGroupRanges = category.optionGroups.map((group) => {
        if (group.options.length === 0) return { min: 0, max: 0 };
        const prices = group.options.map(optionPrice);
        return { min: Math.min(...prices), max: Math.max(...prices) };
    });

    const min = perGroupRanges.reduce((sum, r) => sum + r.min, category.price);
    const max = perGroupRanges.reduce((sum, r) => sum + r.max, category.price);

    return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}
