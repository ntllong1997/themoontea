'use client';

// Cart building shared by the staff POS (/order) and the customer-facing
// online order page (/order/online). Both build the exact same cart-line
// shape — { name, modifiers, price, type, quantity } — which `toOrderRows`
// expands into one `orders` row per physical unit.

import { useCallback, useMemo, useState } from 'react';
import { PRICES, TAX_RATE, HOT_CHEETO_DUST_PRICE } from '@/components/OrderPanel';

export const HOT_CHEETO_DUST_LABEL = 'Hot Cheeto Dust';

const sameModifiers = (a = [], b = []) =>
    a.length === b.length && a.every((mod, i) => mod === b[i]);

export function useCart() {
    const [cart, setCart] = useState([]);
    const [selectedDrink, setSelectedDrink] = useState('');
    const [selectedBoba, setSelectedBoba] = useState('');
    const [selectedCorndogInside, setSelectedCorndogInside] = useState('');
    const [selectedCorndogOutside, setSelectedCorndogOutside] = useState('');
    const [selectedCorndogDust, setSelectedCorndogDust] = useState(false);

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

    const handleAddBoba = useCallback(() => {
        if (!selectedDrink || !selectedBoba) return;
        addCartLine({
            name: selectedDrink,
            modifiers: [selectedBoba],
            price: PRICES.Boba,
            type: 'Boba',
        });
        setSelectedDrink('');
        setSelectedBoba('');
    }, [selectedDrink, selectedBoba, addCartLine]);

    const handleAddCorndog = useCallback(() => {
        if (!selectedCorndogInside || !selectedCorndogOutside) return;
        addCartLine({
            name: `${selectedCorndogInside} ${selectedCorndogOutside}`,
            modifiers: selectedCorndogDust ? [HOT_CHEETO_DUST_LABEL] : [],
            price: PRICES.Corndog + (selectedCorndogDust ? HOT_CHEETO_DUST_PRICE : 0),
            type: 'Corndog',
        });
        setSelectedCorndogInside('');
        setSelectedCorndogOutside('');
        setSelectedCorndogDust(false);
    }, [selectedCorndogInside, selectedCorndogOutside, selectedCorndogDust, addCartLine]);

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
        selection: {
            drink: selectedDrink,
            boba: selectedBoba,
            corndogInside: selectedCorndogInside,
            corndogOutside: selectedCorndogOutside,
            corndogDust: selectedCorndogDust,
        },
        onSelectDrink: setSelectedDrink,
        onSelectBoba: setSelectedBoba,
        onSelectCorndogInside: setSelectedCorndogInside,
        onSelectCorndogOutside: setSelectedCorndogOutside,
        onToggleCorndogDust: () => setSelectedCorndogDust((d) => !d),
        onAddBoba: handleAddBoba,
        onAddCorndog: handleAddCorndog,
    };

    return { cart, changeQuantity, clearCart, totals, orderPanelProps };
}
