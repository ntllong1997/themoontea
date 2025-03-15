'use client';

import { useState, useEffect } from 'react';

export default function OrderSystem() {
    const [menu, setMenu] = useState(() => {
        const savedMenu = localStorage.getItem('menu');
        return savedMenu
            ? JSON.parse(savedMenu)
            : {
                  'Boba Tea': [
                      { name: 'Classic Milk Tea', price: 5 },
                  ],
                  'Corndog': [
                      {
                          name: 'Fried Chicken Banh Mi',
                          price: 7,

                      },
                  ],
              };
    });

    const [order, setOrder] = useState([]);
    const [history, setHistory] = useState(() => {
        const savedHistory = localStorage.getItem('history');
        return savedHistory ? JSON.parse(savedHistory) : [];
    });
    const [selectedCategory, setSelectedCategory] = useState('Boba Tea');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [newItem, setNewItem] = useState({
        name: '',
        price: '',
        category: '',
        
    });
    const [showingHistory, setShowingHistory] = useState(false);

    useEffect(() => {
        localStorage.setItem('menu', JSON.stringify(menu));
    }, [menu]);

    useEffect(() => {
        localStorage.setItem('history', JSON.stringify(history));
    }, [history]);

    const handleNewItemSubmit = () => {
        if (!newItem.name || !newItem.price || !newItem.category) return;
        setMenu((prevMenu) => {
            const updatedMenu = {
                ...prevMenu,
                [newItem.category]: [
                    ...(prevMenu[newItem.category] || []),
                    newItem,
                ],
            };
            localStorage.setItem('menu', JSON.stringify(updatedMenu));
            return updatedMenu;
        });
        setNewItem({ name: '', price: '', category: ''});
        setIsAdding(false);
    };

    const sendOrder = () => {
        setHistory([...history, { id: history.length + 1, items: [...order] }]);
        setOrder([]);
    };

    const showHistory = () => {
        setShowingHistory(!showingHistory);
    };

    return (
        <div className='flex h-screen'>
            <div className='w-1/3 bg-gray-100 p-4'>
                <h2 className='text-xl font-bold'>Order Summary</h2>
                {order.map((item, index) => (
                    <div
                        key={index}
                        className='flex justify-between p-2 border-b'
                    >
                        <span>
                            {item.name} - ${item.price}
                        </span>
                    </div>
                ))}
                <h3 className='text-lg font-bold mt-4'>
                    Total: $
                    {order.reduce((total, item) => total + item.price, 0)}
                </h3>
                <button
                    onClick={sendOrder}
                    className={`mt-4 p-2 text-white ${
                        order.length === 0
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-500'
                    }`}
                    disabled={order.length === 0}
                >
                    Send
                </button>
            </div>
            <div className='w-2/3 p-4'>
                {selectedItem ? (
                    <div>
                        <h2>Modify {selectedItem.name}</h2>
                        <button
                            onClick={() => {
                                setOrder([...order, selectedItem]);
                                setSelectedItem(null);
                            }}
                            className='p-2 bg-green-500 text-white'
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <>
                        <div className='flex space-x-2'>
                            {Object.keys(menu).map((category) => (
                                <button
                                    key={category}
                                    onClick={() => {
                                        setSelectedCategory(category);
                                        setShowingHistory(!showHistory);
                                    }}
                                    className='px-4 py-2 bg-blue-200'
                                >
                                    {category}
                                </button>
                            ))}
                            <button
                                onClick={showHistory}
                                className='px-4 py-2 bg-gray-300'
                            >
                                History
                            </button>
                        </div>
                        {!showingHistory ? (
                            <div className='grid grid-cols-2 gap-4 mt-4'>
                                {menu[selectedCategory]?.map((item) => (
                                    <button
                                        key={item.name}
                                        onClick={() => setSelectedItem(item)}
                                        className='p-4 bg-green-200'
                                    >
                                        {item.name}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setIsAdding(true)}
                                    className='p-4 bg-gray-300'
                                >
                                    +
                                </button>
                            </div>
                        ) : (
                            <div className='mt-4 bg-gray-200 p-4'>
                                <h3 className='text-lg font-bold'>
                                    Order History
                                </h3>
                                {history.map((order, index) => (
                                    <div key={index} className='p-2 border-b'>
                                        <h4 className='font-bold'>
                                            Order #{order.id}
                                        </h4>
                                        {order.items &&
                                        order.items.length > 0 ? (
                                            order.items.map((item, idx) => (
                                                <p key={idx}>
                                                    {item.name} - ${item.price}
                                                </p>
                                            ))
                                        ) : (
                                            <p>No items in this order.</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
            {isAdding && (
                <div className='fixed inset-0 flex items-center justify-center bg-gray-500 bg-opacity-50'>
                    <div className='bg-white p-4'>
                        <h2>Add New Item</h2>
                        <input
                            placeholder='Name'
                            value={newItem.name}
                            onChange={(e) =>
                                setNewItem({ ...newItem, name: e.target.value })
                            }
                        />
                        <input
                            placeholder='Price'
                            type='number'
                            value={newItem.price}
                            onChange={(e) =>
                                setNewItem({
                                    ...newItem,
                                    price: Number(e.target.value),
                                })
                            }
                        />
                        <select
                            value={newItem.category}
                            onChange={(e) =>
                                setNewItem({
                                    ...newItem,
                                    category: e.target.value,
                                })
                            }
                        >
                            <option value='' disabled>
                                Select Category
                            </option>
                            {Object.keys(menu).map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                        <button onClick={handleNewItemSubmit}>Done</button>
                        <button onClick={() => setIsAdding(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
