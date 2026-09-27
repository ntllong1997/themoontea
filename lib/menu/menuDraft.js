// Immutable edits for the /menu editor's working copy of the menu config.
// Every helper returns a NEW draft; the one passed in is never modified.
// Validation is separate (parseMenuConfig) and runs on the whole draft.
import { newCategoryKey } from './menuConfig.js';

const replaceAt = (list, index, item) => list.map((existing, i) => (i === index ? item : existing));
const removeAt = (list, index) => list.filter((_, i) => i !== index);

const mapCategory = (draft, index, fn) => ({
    ...draft,
    categories: replaceAt(draft.categories, index, fn(draft.categories[index])),
});

const mapGroup = (draft, categoryIndex, groupIndex, fn) =>
    mapCategory(draft, categoryIndex, (category) => ({
        ...category,
        optionGroups: replaceAt(category.optionGroups, groupIndex, fn(category.optionGroups[groupIndex])),
    }));

// ── Categories ───────────────────────────────────────────────────────────────

export const updateCategory = (draft, index, patch) =>
    mapCategory(draft, index, (category) => ({ ...category, ...patch }));

/** Appends a visible, option-less category keyed by its (unique) name. */
export function addCategory(draft, label) {
    const key = newCategoryKey(label, draft.categories.map((c) => c.key));
    const category = { key, label: label.trim(), price: 0, visible: true, optionGroups: [] };
    return { ...draft, categories: [...draft.categories, category] };
}

export const removeCategory = (draft, index) => ({
    ...draft,
    categories: removeAt(draft.categories, index),
});

/** Swaps a category with its neighbour; a move past either end is a no-op. */
export function moveCategory(draft, index, direction) {
    const target = index + direction;
    if (target < 0 || target >= draft.categories.length) return draft;

    const categories = [...draft.categories];
    [categories[index], categories[target]] = [categories[target], categories[index]];
    return { ...draft, categories };
}

// ── Choice groups ────────────────────────────────────────────────────────────

function newGroupKey(groups) {
    const taken = new Set(groups.map((g) => g.key));
    let n = groups.length + 1;
    while (taken.has(`group${n}`)) n += 1;
    return `group${n}`;
}

/** Appends an empty "extra" group; the editor then names it and adds options. */
export const addGroup = (draft, categoryIndex) =>
    mapCategory(draft, categoryIndex, (category) => ({
        ...category,
        optionGroups: [
            ...category.optionGroups,
            { key: newGroupKey(category.optionGroups), label: '', role: 'modifier', options: [] },
        ],
    }));

export const updateGroup = (draft, categoryIndex, groupIndex, patch) =>
    mapGroup(draft, categoryIndex, groupIndex, (group) => ({ ...group, ...patch }));

export const removeGroup = (draft, categoryIndex, groupIndex) =>
    mapCategory(draft, categoryIndex, (category) => ({
        ...category,
        optionGroups: removeAt(category.optionGroups, groupIndex),
    }));

// ── Options ──────────────────────────────────────────────────────────────────

export const addOption = (draft, categoryIndex, groupIndex) =>
    mapGroup(draft, categoryIndex, groupIndex, (group) => ({
        ...group,
        options: [...group.options, { value: '', price: 0 }],
    }));

export const updateOption = (draft, categoryIndex, groupIndex, optionIndex, patch) =>
    mapGroup(draft, categoryIndex, groupIndex, (group) => ({
        ...group,
        options: replaceAt(group.options, optionIndex, { ...group.options[optionIndex], ...patch }),
    }));

export const removeOption = (draft, categoryIndex, groupIndex, optionIndex) =>
    mapGroup(draft, categoryIndex, groupIndex, (group) => ({
        ...group,
        options: removeAt(group.options, optionIndex),
    }));
