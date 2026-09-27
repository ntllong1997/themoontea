'use client';

// Cart building shared by the staff POS (/order) and the customer-facing
// online order page (/order/online). Both build the exact same cart-line
// shape — { name, modifiers, price, type, quantity } — which `toOrderRows`
// expands into one `orders` row per physical unit.
//
// Nothing here knows what a corndog or a boba is: every category, its option
// groups and its add-ons come from the live menu (lib/menu/useMenu.js), so an
// edit on /menu needs no change to this file.

import { useCallback, useMemo, useState } from 'react';
import { TAX_RATE, buildCartLine, emptySelection } from '@/lib/menu/catalog';

const sameModifiers = (a = [], b = []) =>
    a.length === b.length && a.every((mod, i) => mod === b[i]);

// A category that appears after a menu refresh has no stored selection yet.
const NO_SELECTION = { addOns: {} };

/** @param {{ menu: ReturnType<import('@/lib/menu/catalog').buildMenu> }} params */
export function useCart({ menu }) {
    const [cart, setCart] = useState([]);
    // Only categories the user has touched are stored; the rest are derived
    // below, so a menu edit never leaves a category without a selection.
    const [selections, setSelections] = useState({});

    const panelSelections = useMemo(
        () => Object.fromEntries(
            menu.orderableCategories.map((category) => [
                category.key,
                { ...emptySelection(category), ...selections[category.key] },
            ])
        ),
        [menu, selections]
    );

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
            [categoryKey]: { ...(prev[categoryKey] ?? NO_SELECTION), [groupKey]: value },
        }));
    }, []);

    const toggleAddOn = useCallback((categoryKey, addOnKey) => {
        setSelections((prev) => {
            const current = prev[categoryKey] ?? NO_SELECTION;
            const addOns = current.addOns ?? {};
            return {
                ...prev,
                [categoryKey]: { ...current, addOns: { ...addOns, [addOnKey]: !addOns[addOnKey] } },
            };
        });
    }, []);

    // `buildCartLine` returns null while the selection is incomplete, and drops
    // any add-on whose condition no longer holds — so a stale toggle can never
    // reach the cart, priced or named. It also rejects an option the menu no
    // longer has, so an edit on /menu cannot be undercut by an old tap.
    const addToCart = useCallback((categoryKey) => {
        const category = menu.categoryFor(categoryKey);
        if (!category) return;

        const line = buildCartLine(category, panelSelections[categoryKey]);
        if (!line) return;

        addCartLine(line);
        setSelections((prev) => {
            const { [categoryKey]: _cleared, ...rest } = prev;
            return rest;
        });
    }, [menu, panelSelections, addCartLine]);

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
        categories: menu.orderableCategories,
        selections: panelSelections,
        onSelectOption: selectOption,
        onToggleAddOn: toggleAddOn,
        onAdd: addToCart,
    };

    return { cart, changeQuantity, clearCart, totals, orderPanelProps };
}
