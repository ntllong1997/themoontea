// Validation for an editable menu (see lib/menu/defaultMenu.js for the shape).
//
// Every menu goes through `parseMenuConfig` twice: in the editor before it is
// saved, and on every till when it is loaded — the stored row is external data,
// so a till never trusts it. Anything invalid yields `config: null` and a list
// of human-readable errors; callers then keep the previous menu.
//
// Relative imports so this runs under plain `node --test`.
import { formatItemName } from '../orders/orderModel.js';

export const MAX_PRICE = 1000;
const MAX_TEXT_LENGTH = 60;
// Guards the receipt-name check against a pathological menu; real categories
// produce a few dozen combinations.
const MAX_COMBINATIONS_CHECKED = 5000;
const ROLES = new Set(['name', 'modifier']);
// Mirrors RESERVED_CATEGORY_KEYS in catalog.js. Kept separate so this module
// stays free of the catalog's code-owned behaviour.
const RESERVED_KEYS = new Set(['Discount']);

const roundToCent = (value) => Math.round(value * 100) / 100;

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/** A trimmed, non-empty, not-too-long string, or null. */
function cleanText(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length > 0 && text.length <= MAX_TEXT_LENGTH ? text : null;
}

/** A finite price in [0, MAX_PRICE] rounded to the cent, or null. */
function cleanPrice(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value < 0 || value > MAX_PRICE) return null;
    return roundToCent(value);
}

function parseOption(raw, where, errors) {
    const option = typeof raw === 'string' ? { value: raw, price: 0 } : raw;
    if (!isPlainObject(option)) {
        errors.push(`${where}: an option is not valid.`);
        return null;
    }
    const value = cleanText(option.value);
    const price = cleanPrice(option.price ?? 0);
    if (value === null) errors.push(`${where}: every option needs a name (up to ${MAX_TEXT_LENGTH} characters).`);
    if (price === null) errors.push(`${where}: "${option.value}" needs a price from $0 to $${MAX_PRICE}.`);
    return value === null || price === null ? null : { value, price };
}

function parseGroup(raw, categoryName, errors) {
    if (!isPlainObject(raw)) {
        errors.push(`${categoryName}: a choice group is not valid.`);
        return null;
    }
    const key = cleanText(raw.key);
    const label = cleanText(raw.label);
    const where = `${categoryName} › ${label ?? 'choice group'}`;

    if (key === null) errors.push(`${where}: missing an id.`);
    if (label === null) errors.push(`${categoryName}: every choice group needs a name.`);
    if (!ROLES.has(raw.role)) errors.push(`${where}: must be part of the name or an extra.`);
    if (!Array.isArray(raw.options) || raw.options.length === 0) {
        errors.push(`${where}: needs at least one option.`);
        return null;
    }

    const options = raw.options.map((option) => parseOption(option, where, errors));
    const values = options.filter(Boolean).map((option) => option.value);
    const duplicate = values.find((value, i) => values.indexOf(value) !== i);
    if (duplicate) errors.push(`${where}: "${duplicate}" is listed twice.`);

    const isValid = key !== null && label !== null && ROLES.has(raw.role)
        && !options.includes(null) && !duplicate;
    return isValid ? { key, label, role: raw.role, options } : null;
}

function parseCategory(raw, index, errors) {
    if (!isPlainObject(raw)) {
        errors.push(`Item ${index + 1} is not valid.`);
        return null;
    }
    const key = cleanText(raw.key);
    const label = cleanText(raw.label);
    const name = label ?? `Item ${index + 1}`;
    const price = cleanPrice(raw.price);
    const visible = raw.visible === undefined ? true : raw.visible;
    const isReserved = key !== null && RESERVED_KEYS.has(key);

    if (key === null) errors.push(`${name}: missing an id.`);
    if (isReserved) errors.push(`"${key}" is reserved — pick another name.`);
    if (label === null) errors.push(`Item ${index + 1} needs a name (up to ${MAX_TEXT_LENGTH} characters).`);
    if (price === null) errors.push(`${name}: price must be from $0 to $${MAX_PRICE}.`);
    if (typeof visible !== 'boolean') errors.push(`${name}: "shown" must be on or off.`);

    const rawGroups = raw.optionGroups ?? [];
    if (!Array.isArray(rawGroups)) {
        errors.push(`${name}: choice groups are not valid.`);
        return null;
    }
    const optionGroups = rawGroups.map((group) => parseGroup(group, name, errors));
    const groupKeys = optionGroups.filter(Boolean).map((group) => group.key);
    const hasDuplicateGroup = new Set(groupKeys).size !== groupKeys.length;
    if (hasDuplicateGroup) errors.push(`${name}: two choice groups share an id.`);

    const isValid = key !== null && !isReserved && label !== null && price !== null
        && typeof visible === 'boolean' && !optionGroups.includes(null) && !hasDuplicateGroup;
    return isValid ? { key, label, price, visible, optionGroups } : null;
}

/** Every receipt name a category can print (add-ons aside), capped. */
function receiptNames(category) {
    const combos = category.optionGroups.reduce(
        (acc, group) => acc.length > MAX_COMBINATIONS_CHECKED
            ? acc
            : acc.flatMap((combo) => group.options.map((option) => [...combo, [group, option.value]])),
        [[]]
    );

    return combos.map((combo) => {
        const nameParts = combo.filter(([group]) => group.role === 'name').map(([, value]) => value);
        const modifiers = combo.filter(([group]) => group.role === 'modifier').map(([, value]) => value);
        const name = nameParts.length > 0 ? nameParts.join(' ') : category.label;
        return formatItemName({ name, modifiers });
    });
}

/**
 * The sales summary groups sold items by their printed name, so two
 * categories that can print the same name would have their counts merged.
 */
function findNameCollisions(categories, errors) {
    const owners = new Map();
    for (const category of categories) {
        for (const name of new Set(receiptNames(category))) {
            const owner = owners.get(name);
            if (owner && owner !== category.label) {
                errors.push(`"${name}" would print the same for ${owner} and ${category.label} — rename one.`);
            }
            owners.set(name, category.label);
        }
    }
}

function findDuplicates(categories, errors) {
    const keys = categories.map((c) => c.key);
    const labels = categories.map((c) => c.label.toLowerCase());
    keys.forEach((key, i) => {
        if (keys.indexOf(key) !== i) errors.push(`Two items share the id "${key}".`);
    });
    labels.forEach((label, i) => {
        if (labels.indexOf(label) !== i) errors.push(`Two items are both called "${categories[i].label}".`);
    });
}

/**
 * Validate and normalise a menu config from any source.
 *
 * @param {unknown} raw
 * @returns {{ config: import('./defaultMenu.js').MenuConfig | null, errors: string[] }}
 */
export function parseMenuConfig(raw) {
    if (!isPlainObject(raw) || !Array.isArray(raw.categories)) {
        return { config: null, errors: ['The menu is not in a format this app understands.'] };
    }
    if (raw.categories.length === 0) {
        return { config: null, errors: ['The menu needs at least one item.'] };
    }

    const errors = [];
    const categories = raw.categories.map((category, i) => parseCategory(category, i, errors));
    if (categories.includes(null)) return { config: null, errors };

    findDuplicates(categories, errors);
    if (errors.length === 0) findNameCollisions(categories, errors);

    return errors.length === 0 ? { config: { categories }, errors } : { config: null, errors };
}

/**
 * The key for a category created in the editor: its name, made unique. A key
 * is stored on every order row as its `type`, so it is fixed at creation and
 * never reuses one that exists — even hidden — or one the code owns.
 */
export function newCategoryKey(label, existingKeys) {
    const base = label.trim();
    const taken = new Set([...existingKeys, ...RESERVED_KEYS]);
    if (!taken.has(base)) return base;

    let suffix = 2;
    while (taken.has(`${base} ${suffix}`)) suffix += 1;
    return `${base} ${suffix}`;
}
