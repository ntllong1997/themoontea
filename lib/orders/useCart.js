'use client';

// Cart building shared by the staff POS (/order) and the customer-facing
// online order page (/order/online). Both build the exact same cart-line
// shape — { name, modifiers, price, type, quantity } — which `toOrderRows`
// expands into one `orders` row per physical unit.
//
// Nothing here knows what a corndog or a boba is: every category, its option
// groups and its add-ons come from lib/menu/catalog.js, so adding a category
// needs no change to this file.

import { useCallback, useMemo, useState } from 'react';
import {
    ORDERABLE_CATEGORIES,
    TAX_RATE,
    buildCartLine,
    categoryFor,
    emptySelection,
} from '@/lib/menu/catalog';

const sameModifiers = (a = [], b = []) =>
    a.length === b.length && a.every((mod, i) => mod === b[i]);

const freshSelections = () =>
    Object.fromEntries(
        ORDERABLE_CATEGORIES.map((category) => [category.key, emptySelection(category)])
    );

export function useCart() {
    const [cart, setCart] = useState([]);
    const [selections, setSelections] = useState(freshSelections);

    // Adds a line, or bumps the quantity of the matching one. Lines match only
    // when both the base name and the modifiers agree, so "Ube (Tapioca)" and
    // "Ube (Jelly)" stay separate lines.
    const addCartLine = useCallback((line) => {
        setCart((prev) => {
            const idx = prev.findIndex(
                (i) => i.name === line.name && sameModifiers(i.modifiers, line.modifiers)
            );
            if (idx < 0) return [...prev, { ...line, quantity: 1 }];
            return prev.map((item, i) =>
                i === idx ? { ...item, quantity: item.quantity + 1 } : item
            );
        });
    }, []);

    const selectOption = useCallback((categoryKey, groupKey, value) => {
        setSelections((prev) => ({
            ...prev,
            [categoryKey]: { ...prev[categoryKey], [groupKey]: value },
        }));
    }, []);

    const toggleAddOn = useCallback((categoryKey, addOnKey) => {
        setSelections((prev) => ({
            ...prev,
            [categoryKey]: {
                ...prev[categoryKey],
                addOns: {
                    ...prev[categoryKey].addOns,
                    [addOnKey]: !prev[categoryKey].addOns[addOnKey],
                },
            },
        }));
    }, []);

    // `buildCartLine` returns null while the selection is incomplete, and drops
    // any add-on whose condition no longer holds — so a stale toggle can never
    // reach the cart, priced or named.
    const addToCart = useCallback((categoryKey) => {
        const category = categoryFor(categoryKey);
        if (!category) return;

        const line = buildCartLine(category, selections[categoryKey]);
        if (!line) return;

        addCartLine(line);
        setSelections((prev) => ({ ...prev, [categoryKey]: emptySelection(category) }));
    }, [selections, addCartLine]);

    const changeQuantity = useCallback((index, delta) => {
        setCart((prev) =>
            prev
                .map((item, i) =>
                    i === index ? { ...item, quantity: item.quantity + delta } : item
                )
                .filter((item) => item.quantity > 0)
        );
    }, []);

    const clearCart = useCallback(() => setCart([]), []);

    const totals = useMemo(() => {
        const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
        const tax = subtotal * TAX_RATE;
        return { subtotal, tax, total: subtotal + tax };
    }, [cart]);

    const orderPanelProps = {
        categories: ORDERABLE_CATEGORIES,
        selections,
        onSelectOption: selectOption,
        onToggleAddOn: toggleAddOn,
        onAdd: addToCart,
    };

    return { cart, changeQuantity, clearCart, totals, orderPanelProps };
}
