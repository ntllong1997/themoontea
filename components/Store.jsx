// lib/store.js
import { create } from 'zustand';

const useStore = create((set) => ({
    orders: [],
    menuItems: [
        {
            id: 1,
            name: 'Burger',
            price: 8.99,
            category: 'Main',
            mods: ['Extra Cheese', 'No Onions'],
        },
        {
            id: 2,
            name: 'Fries',
            price: 3.99,
            category: 'Side',
            mods: ['Large', 'Small'],
        },
    ],
    categories: ['Main', 'Side', 'Drink'],
    addToOrder: (item) => set((state) => ({ orders: [...state.orders, item] })),
    removeFromOrder: (index) =>
        set((state) => ({
            orders: state.orders.filter((_, i) => i !== index),
        })),
    moveOrderItem: (index, direction) =>
        set((state) => {
            const newOrders = [...state.orders];
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex >= 0 && newIndex < newOrders.length) {
                [newOrders[index], newOrders[newIndex]] = [
                    newOrders[newIndex],
                    newOrders[index],
                ];
            }
            return { orders: newOrders };
        }),
    applyDiscount: (index, discount) =>
        set((state) => {
            const newOrders = [...state.orders];
            newOrders[index].discount = discount;
            return { orders: newOrders };
        }),
    addMenuItem: (item) =>
        set((state) => ({
            menuItems: [
                ...state.menuItems,
                { ...item, id: state.menuItems.length + 1 },
            ],
        })),
}));

export default useStore;
