// The single source of truth for what the shop sells.
//
// Adding a category means adding ONE entry to CATEGORIES below. The order
// panel, the cart, the history colours, the station screens and the sales
// summary are all derived from this list, so no other file has to change.
//
// `key` is the string persisted as an order row's `type`. The iPad app has a
// matching MenuCatalog.swift — keep the two in sync, and ship the iOS side
// FIRST when adding a category, otherwise older iPads receive a `type` they
// cannot decode and silently drop the order.
//
// Relative import (not the "@/" alias) so this module can be unit tested under
// plain `node --test`, without the Next.js path-alias resolver.
import { TAX_RATE } from '../constants.js';

export { TAX_RATE };

/**
 * A category's option group. `role` decides where the chosen value ends up on
 * the cart line:
 *   'name'     -> joined with the other 'name' groups to form the base name
 *   'modifier' -> emitted as a modifier, so it renders as "Base (Value)"
 *
 * @typedef {{ key: string, label: string, options: string[], role: 'name'|'modifier' }} OptionGroup
 */

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

export const CATEGORIES = [
    {
        key: 'Corndog',
        label: 'Corndog',
        orderable: true,
        price: 8.0,
        layout: 'rows',
        optionGroups: [
            { key: 'inside', label: 'Inside', options: ['Cheese', 'Half-Half'], role: 'name' },
            { key: 'outside', label: 'Outside', options: ['Potato', 'Hot Cheeto', 'Original'], role: 'name' },
        ],
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
    {
        key: 'Boba',
        label: 'Boba',
        orderable: true,
        price: 8.0,
        layout: 'columns',
        optionGroups: [
            {
                key: 'drink',
                label: 'Drink',
                role: 'name',
                options: [
                    'Brown Sugar',
                    'Matcha Brown Sugar',
                    'Golden Taro',
                    'Korean Strawberry',
                    'Tropical',
                    'Strawberry',
                    'Cafe',
                    'Matcha Strawberry',
                ],
            },
            {
                key: 'boba',
                label: 'Boba',
                role: 'modifier',
                options: ['Tapioca', 'Mango Popping', 'Strawberry Popping', 'Nothing'],
            },
        ],
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
    // Cookie, Lemonade and Egg Roll put their flavour in a MODIFIER group, not
    // a name group, so a line reads "Cookie (Matcha Strawberry)". Naming them
    // by flavour alone would collide with the boba of the same name — and the
    // sales summary groups by name, so a $5 cookie would be counted with an
    // $8 drink. See the uniqueness test in catalog.test.js.
    {
        key: 'Cookie',
        label: 'Cookie',
        orderable: true,
        price: 5.0,
        layout: 'columns',
        optionGroups: [
            {
                key: 'flavor',
                label: 'Flavor',
                role: 'modifier',
                options: [
                    'Matcha Strawberry',
                    'Nutella Banana',
                    'Red Velvet',
                    'Taro Ube',
                    'Oreo 2.0',
                    'Biscoff',
                ],
            },
        ],
        addOns: [],
        flow: COOKIE_FLOW,
        station: null,
    },
    {
        key: 'Lemonade',
        label: 'Lemonade',
        orderable: true,
        price: 7.0,
        layout: 'rows',
        optionGroups: [
            { key: 'base', label: 'Flavor', options: ['Tea', 'Soda'], role: 'modifier' },
        ],
        addOns: [],
        flow: LEMONADE_FLOW,
        station: null,
    },
    // No option groups at all: a fixed 4-piece portion. `isSelectionComplete`
    // is vacuously true for an empty group list, so it can be added straight
    // away, and the line name falls back to the category label.
    {
        key: 'Egg Roll',
        label: 'Egg Roll',
        orderable: true,
        price: 7.0,
        layout: 'rows',
        optionGroups: [],
        addOns: [],
        flow: EGG_ROLL_FLOW,
        station: null,
    },
    {
        key: 'Discount',
        label: 'Discount',
        orderable: false,
        price: 0,
        layout: 'rows',
        optionGroups: [],
        addOns: [],
        flow: DISCOUNT_FLOW,
        station: null,
    },
];

// ── Lookups ──────────────────────────────────────────────────────────────────

const BY_KEY = new Map(CATEGORIES.map((category) => [category.key, category]));
const BY_SLUG = new Map(CATEGORIES.filter((c) => c.station).map((c) => [c.station.slug, c]));

/** @returns {object|undefined} the category a cart line or order item belongs to */
export const categoryFor = (type) => BY_KEY.get(type);

/** @returns {object|undefined} the category served by a /order/<slug> station */
export const categoryForSlug = (slug) => BY_SLUG.get(slug);

/** Categories that have their own prep screen, in menu order. */
export const STATION_CATEGORIES = CATEGORIES.filter((c) => c.station);

/** Categories staff can actually add to a cart — what the order panel renders. */
export const ORDERABLE_CATEGORIES = CATEGORIES.filter((c) => c.orderable);

/** Every category key, in menu order — used for panel toggles and summary tabs. */
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

// ── Per-unit status ──────────────────────────────────────────────────────────

/**
 * Resolve a unit's flow state, tolerating a `type` this build does not know
 * (an order placed by a newer client) so history still renders instead of
 * throwing. Unknown types fall back to the neutral flow.
 */
export function flowStateFor(type, state) {
    const flow = categoryFor(type)?.flow ?? SIMPLE_FLOW;
    return flow.states[state] ?? flow.states[flow.initial];
}

/** The state a freshly-seen unit of this type starts in. */
export const initialStateFor = (type) => (categoryFor(type)?.flow ?? SIMPLE_FLOW).initial;

/** The state that follows `state` when a unit is clicked. */
export const nextStateFor = (type, state) => flowStateFor(type, state).next;

// ── Selection -> cart line ───────────────────────────────────────────────────

/** An empty selection for a category: every option group unset, add-ons off. */
export function emptySelection(category) {
    const groups = Object.fromEntries(category.optionGroups.map((g) => [g.key, '']));
    const addOns = Object.fromEntries(category.addOns.map((a) => [a.key, false]));
    return { ...groups, addOns };
}

/** True once every option group has a value — i.e. the line can be added. */
export function isSelectionComplete(category, selection) {
    return category.optionGroups.every((group) => Boolean(selection[group.key]));
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

    // A category with no name-role groups (a flavour-only cookie, a plain egg
    // roll) is named after itself, so its flavour reads as "Cookie (Biscoff)"
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

    return {
        name,
        modifiers: [...optionModifiers, ...checked.map((a) => a.resolvedLabel)],
        price: checked.reduce((sum, addOn) => sum + addOn.price, category.price),
        type: category.key,
    };
}
