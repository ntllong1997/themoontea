'use client';

import { useState } from 'react';
import MenuCategory from '@/components/Menu/MenuCategory';
import BobaOptions from '@/components/Menu/BobaOptions';
import CorndogOptions from '@/components/Menu/CorndogOptions';
import { Button } from '@/components/ui/Button';

const Menu = ({ onAddItem }) => {
    const [category, setCategory] = useState('Boba');
    const [selectedBoba, setSelectedBoba] = useState('');
    const [selectedDrink, setSelectedDrink] = useState('');
    const [selectedCorndog, setSelectedCorndog] = useState('');

    const prices = {
        Boba: 8.0,
        Corndog: 8.0,
        Soda: 3.0,
    };

    const handleAddItem = () => {
        let name = '';
        let price = 0;
        if (category === 'Boba' && selectedDrink && selectedBoba) {
            name = `${selectedDrink} with ${selectedBoba}`;
            price = prices.Boba;
        } else if (category === 'Corndog' && selectedCorndog) {
            name = selectedCorndog;
            price = selectedCorndog === 'Soda' ? prices.Soda : prices.Corndog;
        } else {
            return; // Nothing selected
        }

        const newItem = {
            name,
            price,
            type: category,
            quantity: 1,
        };
        onAddItem(newItem);

        setSelectedDrink('');
        setSelectedBoba('');
        setSelectedCorndog('');
    };

    return (
        <div>
            <MenuCategory category={category} setCategory={setCategory} />
            {category === 'Boba' && (
                <BobaOptions
                    selectedDrink={selectedDrink}
                    setSelectedDrink={setSelectedDrink}
                    selectedBoba={selectedBoba}
                    setSelectedBoba={setSelectedBoba}
                />
            )}
            {category === 'Corndog' && (
                <CorndogOptions
                    selectedCorndog={selectedCorndog}
                    setSelectedCorndog={setSelectedCorndog}
                />
            )}
            <Button onClick={handleAddItem} className='w-full mb-6'>
                Add to Order
            </Button>
        </div>
    );
};

export default Menu;
