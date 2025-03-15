// components/MenuPanel.js
import { useState } from 'react';
import useStore from '@/components/Store';

export default function MenuPanel() {
    const { menuItems, categories, addToOrder, addMenuItem } = useStore();
    const [selectedCategory, setSelectedCategory] = useState(categories[0]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showMods, setShowMods] = useState(null);
    const [newItem, setNewItem] = useState({
        name: '',
        price: '',
        category: '',
        mods: '',
    });

    const filteredItems = menuItems.filter(
        (item) => item.category === selectedCategory
    );

    const handleAddToOrder = (item, mods = []) => {
        addToOrder({ ...item, mods });
        setShowMods(null);
    };

    const handleAddItem = () => {
        addMenuItem({
            name: newItem.name,
            price: parseFloat(newItem.price),
            category: newItem.category,
            mods: newItem.mods.split(',').map((mod) => mod.trim()),
        });
        setShowAddForm(false);
        setNewItem({ name: '', price: '', category: '', mods: '' });
    };

    return (
        <div className='relative flex flex-col gap-4'>
            <div className='flex gap-2 overflow-x-auto'>
                {categories.map((category) => (
                    <button
                        key={category}
                        className={`px-4 py-2 rounded-lg ${
                            category === selectedCategory
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-200 text-gray-700'
                        }`}
                        onClick={() => setSelectedCategory(category)}
                    >
                        {category}
                    </button>
                ))}
            </div>
            <div className='grid grid-cols-2 gap-4'>
                {filteredItems.map((item) => (
                    <div
                        key={item.id}
                        className='p-4 bg-gray-50 rounded-lg shadow cursor-pointer hover:bg-gray-100'
                        onClick={() => setShowMods(item)}
                    >
                        <span className='text-lg'>
                            {item.name} - ${item.price.toFixed(2)}
                        </span>
                    </div>
                ))}
                <button
                    className='p-4 bg-green-100 rounded-lg shadow flex items-center justify-center text-2xl font-bold text-green-600 hover:bg-green-200'
                    onClick={() => setShowAddForm(true)}
                >
                    +
                </button>
            </div>

            {showMods && (
                <div className='absolute inset-0 bg-white p-6 rounded-lg shadow-lg flex flex-col gap-4'>
                    <h3 className='text-xl font-bold'>
                        Customize {showMods.name}
                    </h3>
                    <div className='flex flex-col gap-2'>
                        {showMods.mods.map((mod, index) => (
                            <label
                                key={index}
                                className='flex items-center gap-2'
                            >
                                <input
                                    type='checkbox'
                                    value={mod}
                                    className='h-5 w-5'
                                />{' '}
                                {mod}
                            </label>
                        ))}
                    </div>
                    <textarea
                        placeholder='Special Instructions'
                        className='w-full p-2 border rounded'
                        rows='3'
                    />
                    <div className='flex gap-2'>
                        <button
                            onClick={() => handleAddToOrder(showMods, [])}
                            className='px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700'
                        >
                            Add to Order
                        </button>
                        <button
                            onClick={() => setShowMods(null)}
                            className='px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400'
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {showAddForm && (
                <div className='absolute inset-0 bg-white p-6 rounded-lg shadow-lg flex flex-col gap-4'>
                    <h3 className='text-xl font-bold'>Add New Item</h3>
                    <input
                        type='text'
                        placeholder='Name'
                        value={newItem.name}
                        onChange={(e) =>
                            setNewItem({ ...newItem, name: e.target.value })
                        }
                        className='w-full p-2 border rounded'
                    />
                    <input
                        type='number'
                        placeholder='Price'
                        value={newItem.price}
                        onChange={(e) =>
                            setNewItem({ ...newItem, price: e.target.value })
                        }
                        className='w-full p-2 border rounded'
                    />
                    <select
                        value={newItem.category}
                        onChange={(e) =>
                            setNewItem({ ...newItem, category: e.target.value })
                        }
                        className='w-full p-2 border rounded'
                    >
                        <option value=''>Select Category</option>
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>
                                {cat}
                            </option>
                        ))}
                    </select>
                    <input
                        type='text'
                        placeholder='Mods (comma separated)'
                        value={newItem.mods}
                        onChange={(e) =>
                            setNewItem({ ...newItem, mods: e.target.value })
                        }
                        className='w-full p-2 border rounded'
                    />
                    <div className='flex gap-2'>
                        <button
                            onClick={handleAddItem}
                            className='px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700'
                        >
                            Done
                        </button>
                        <button
                            onClick={() => setShowAddForm(false)}
                            className='px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400'
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
