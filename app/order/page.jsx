'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createOrder, getOrderHistory, updateOrderPhone } from '@/lib/db';
import { ORDER_SOURCE, calculateTotalRevenue } from '@/lib/orders/orderModel';
import { useCart } from '@/lib/orders/useCart';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import OrderPanel, { PRICES, TAX_RATE, HOT_CHEETO_DUST_PRICE } from '@/components/OrderPanel';
import HistorySection from '@/components/HistorySection';
import { checkPrinterStatus, printReceipt as eposPrint } from '@/lib/printer';
import { Printer } from 'lucide-react';

const CORNDOG_STATES = { received: 'received', making: 'making', ready: 'ready', pickedup: 'pickedup' };
const CORNDOG_NEXT = { received: 'making', making: 'ready', ready: 'pickedup', pickedup: 'received' };

const CORNDOG_STATE_CLASS = {
    received: 'bg-red-50 text-red-900',
    making: 'bg-red-100 text-red-900',
    ready: 'bg-red-300 text-red-900',
    pickedup: 'bg-red-500 text-white',
};

const CORNDOG_STATE_BADGE = {
    received: 'New',
    making: 'Making…',
    ready: 'Ready ✓',
    pickedup: 'Picked Up ✓',
};

const CORNDOG_STATE_TOOLTIP = {
    received: 'Click to mark as Making',
    making: 'Click to mark as Ready',
    ready: 'Click to mark as Picked Up',
    pickedup: 'Click to reset',
};

const BOBA_STATES = { new: 'new', ready: 'ready', pickedup: 'pickedup' };
const BOBA_NEXT = { new: 'ready', ready: 'pickedup', pickedup: 'new' };

const BOBA_STATE_CLASS = {
    new: 'bg-blue-100 text-blue-900',
    ready: 'bg-blue-300 text-blue-900',
    pickedup: 'bg-blue-500 text-white',
};

const BOBA_STATE_BADGE = {
    new: 'New',
    ready: 'Ready ✓',
    pickedup: 'Picked Up ✓',
};

const BOBA_STATE_TOOLTIP = {
    new: 'Click to mark as Ready',
    ready: 'Click to mark as Picked Up',
    pickedup: 'Click to reset',
};

const PANELS = [
    { key: 'corndog', label: 'Corndog' },
    { key: 'boba', label: 'Boba' },
];

// The print server prints one line per {name, price}, and modifiers now live
// in their own field, so fold them back into the name for the receipt.
const toPrintableItems = (units) =>
    units.map(({ displayName, price }) => ({ name: displayName, price }));

export default function OrderSystem() {
    // Cart building is shared with the customer online page (/order/online);
    // only the `source` each one submits differs.
    const {
        cart: orders,
        changeQuantity: handleQuantityChange,
        clearCart,
        totals,
        orderPanelProps,
    } = useCart();

    const [history, setHistory] = useState([]);
    const [phone, setPhone] = useState('');

    const [bobaStates, setBobaStates] = useState({});
    const [corndogStates, setCorndogStates] = useState({});
    const [notifiedOrders, setNotifiedOrders] = useState(new Set());
    const [phoneOverrides, setPhoneOverrides] = useState({});
    const [mobileTab, setMobileTab] = useState('order');
    const [printerStatus, setPrinterStatus] = useState('disconnected'); // 'disconnected'|'connecting'|'connected'|'error'
    const [sendError, setSendError] = useState('');

    // Resizable columns
    const [colSplit, setColSplit] = useState(40);
    const containerRef = useRef(null);
    const isDragging = useRef(false);
    const mobileHistoryRef = useRef(null);
    const tabletHistoryRef = useRef(null);

    // Panel visibility
    const [visiblePanels, setVisiblePanels] = useState(new Set(['corndog', 'boba']));
    const [showAddMenu, setShowAddMenu] = useState(false);

    const togglePanel = useCallback((key) => {
        setVisiblePanels((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const hiddenPanels = PANELS.filter((p) => !visiblePanels.has(p.key));

    const onDragMove = useCallback((clientX) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const pct = ((clientX - rect.left) / rect.width) * 100;
        setColSplit(Math.min(Math.max(pct, 15), 80));
    }, []);

    const fetchHistory = useCallback(async () => {
        try {
            const groupedOrders = await getOrderHistory();
            setHistory(groupedOrders);
        } catch (error) {
            console.error('Failed to fetch order history:', error);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
        const id = setInterval(fetchHistory, 3000);
        return () => clearInterval(id);
    }, [fetchHistory]);

    useEffect(() => {
        if (mobileTab === 'history') {
            mobileHistoryRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [mobileTab]);

    useEffect(() => {
        const poll = async () => setPrinterStatus(await checkPrinterStatus());
        poll();
        const id = setInterval(poll, 5000);
        return () => clearInterval(id);
    }, []);

    const handleSendOrder = useCallback(async () => {
        if (orders.length === 0) return;
        setSendError('');
        try {
            // Rung up in store: the receipt prints here, so the row is stored
            // as source='pos'/print_status='printed' and the iPad's auto-print
            // queue never picks it up again.
            const created = await createOrder({
                cartItems: orders,
                source: ORDER_SOURCE.pos,
                phone,
                paymentMethod: 'cash',
            });

            setHistory((prev) => [created, ...prev]);
            clearCart();
            setPhone('');
            setMobileTab('history');
            tabletHistoryRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            if (printerStatus === 'connected') {
                try {
                    await eposPrint({
                        orderNumber: created.orderNumber,
                        items: toPrintableItems(created.items),
                        taxRate: TAX_RATE,
                    });
                } catch (printErr) {
                    console.error('[print] failed:', printErr);
                }
            }
        } catch (err) {
            console.error('Send order failed:', err);
            setSendError('Order failed to save — please try again.');
        }
    }, [orders, phone, printerStatus]);

    const handleBobaItemClick = useCallback((orderNumber, itemIndex) => {
        const key = `${orderNumber}-${itemIndex}`;
        setBobaStates((prev) => ({ ...prev, [key]: BOBA_NEXT[prev[key] || BOBA_STATES.new] }));
    }, []);

    const handleCorndogItemClick = useCallback((orderNumber, itemIndex) => {
        const key = `${orderNumber}-${itemIndex}`;
        setCorndogStates((prev) => ({ ...prev, [key]: CORNDOG_NEXT[prev[key] || CORNDOG_STATES.received] }));
    }, []);

    // Unified click — dispatches by item type
    const handleItemClick = useCallback((orderNumber, itemIndex) => {
        const order = history.find((o) => o.orderNumber === orderNumber);
        const item = order?.items[itemIndex];
        if (!item) return;
        if (item.type === 'Boba') handleBobaItemClick(orderNumber, itemIndex);
        else handleCorndogItemClick(orderNumber, itemIndex);
    }, [history, handleBobaItemClick, handleCorndogItemClick]);

    const markNotified = useCallback((orderNumber) => {
        setNotifiedOrders((prev) => {
            const next = new Set(prev);
            next.add(orderNumber);
            return next;
        });
    }, []);

    const getOrderPhone = useCallback((orderNumber) => {
        if (phoneOverrides[orderNumber] !== undefined) return phoneOverrides[orderNumber];
        return history.find((order) => order.orderNumber === orderNumber)?.phone ?? '';
    }, [phoneOverrides, history]);

    const handleSavePhone = useCallback(async (orderNumber, newPhone) => {
        setPhoneOverrides((prev) => ({ ...prev, [orderNumber]: newPhone }));
        await updateOrderPhone(orderNumber, newPhone);
    }, []);

    const handleReprintOrder = useCallback(async (orderNumber, items) => {
        try {
            await eposPrint({
                orderNumber,
                items: toPrintableItems(items.map(({ item }) => item)),
                taxRate: TAX_RATE,
            });
        } catch (err) {
            console.error('[reprint] failed:', err);
        }
    }, []);

    const getOrderActions = useCallback(
        ({ orderNumber, items }) => {
            const orderPhone = getOrderPhone(orderNumber);

            const printBtn = printerStatus === 'connected' ? (
                <button
                    onClick={(e) => { e.stopPropagation(); handleReprintOrder(orderNumber, items); }}
                    className='p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors'
                    title='Reprint receipt'
                >
                    <Printer size={14} />
                </button>
            ) : null;

            if (notifiedOrders.has(orderNumber)) {
                return (
                    <div className='flex items-center gap-1'>
                        {printBtn}
                        <span className='text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded'>
                            Notified ✓
                        </span>
                    </div>
                );
            }

            if (!orderPhone) return printBtn;

            const order = history.find((o) => o.orderNumber === orderNumber);
            const itemList = (order?.items ?? []).map((item) => `• ${item.displayName}`).join('\n');
            const smsBody = `🌙 The Moon Tea\nOrder #${orderNumber} is ready for pickup! 🎉\n\n${itemList}\n\nSee you soon! 🧡`;
            const smsHref = `sms:${orderPhone}?body=${encodeURIComponent(smsBody)}`;
            return (
                <div className='flex items-center gap-1'>
                    {printBtn}
                    <a
                        href={smsHref}
                        onClick={(e) => { e.stopPropagation(); setTimeout(() => markNotified(orderNumber), 500); }}
                        className='rounded px-2 py-1 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors'
                    >
                        Notify
                    </a>
                </div>
            );
        },
        [getOrderPhone, history, notifiedOrders, markNotified, printerStatus, handleReprintOrder]
    );

    // Unified item styling — dispatches by item type
    const getItemClassName = useCallback((item, key) => {
        if (item.type === 'Boba') return BOBA_STATE_CLASS[bobaStates[key] || BOBA_STATES.new];
        return CORNDOG_STATE_CLASS[corndogStates[key] || CORNDOG_STATES.received];
    }, [bobaStates, corndogStates]);

    const getItemBadge = useCallback((key, item) => {
        if (item?.type === 'Boba') return BOBA_STATE_BADGE[bobaStates[key] || BOBA_STATES.new];
        return CORNDOG_STATE_BADGE[corndogStates[key] || CORNDOG_STATES.received];
    }, [bobaStates, corndogStates]);

    const getItemTooltip = useCallback((key, item) => {
        if (item?.type === 'Boba') return BOBA_STATE_TOOLTIP[bobaStates[key] || BOBA_STATES.new];
        return CORNDOG_STATE_TOOLTIP[corndogStates[key] || CORNDOG_STATES.received];
    }, [bobaStates, corndogStates]);

    // Orders filtered by visible panels — combined into one list per order number
    const displayOrders = useMemo(() => {
        return history
            .map((order) => ({
                orderNumber: order.orderNumber,
                items: order.items
                    .map((item, i) => ({ item, itemIndex: i }))
                    .filter(({ item }) =>
                        (item.type === 'Boba' && visiblePanels.has('boba')) ||
                        (item.type !== 'Boba' && visiblePanels.has('corndog'))
                    ),
            }))
            .filter((o) => o.items.length > 0);
    }, [history, visiblePanels]);

    const { subtotal, tax } = totals;
    const total = totals.total.toFixed(2);
    const totalRevenue = calculateTotalRevenue(history);

    const cart = (
        <Card>
            <CardContent>
                <h2 className='text-xl font-bold mb-4'>Cart</h2>

                <div className='mb-4'>
                    <label className='block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1'>
                        Customer Phone
                    </label>
                    <input
                        type='tel'
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder='(555) 000-0000'
                        className='w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500'
                    />
                </div>

                {orders.length === 0 ? (
                    <p className='text-gray-400 text-sm py-6 text-center'>No items added yet.</p>
                ) : (
                    <div className='space-y-3'>
                        {orders.map((item, index) => (
                            <div
                                key={`${item.type}-${item.name}`}
                                className='flex justify-between items-start gap-2 pb-2 border-b last:border-0'
                            >
                                <div className='flex-1 min-w-0'>
                                    <p className='text-sm font-medium leading-snug'>{item.name}</p>
                                    <p className='text-xs text-gray-500'>
                                        ${item.price.toFixed(2)} × {item.quantity} = ${(item.price * item.quantity).toFixed(2)}
                                    </p>
                                </div>
                                <div className='flex items-center gap-1 shrink-0'>
                                    <Button size='sm' variant='outline' onClick={() => handleQuantityChange(index, -1)}>−</Button>
                                    <Button size='sm' variant='outline' onClick={() => handleQuantityChange(index, 1)}>+</Button>
                                    <Button variant='destructive' size='sm' onClick={() => handleQuantityChange(index, -item.quantity)}>✕</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className='mt-4 border-t pt-3 space-y-1 text-sm'>
                    <div className='flex justify-between'><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                    <div className='flex justify-between text-gray-500'><span>Tax (8.25%)</span><span>${tax.toFixed(2)}</span></div>
                    <div className='flex justify-between font-bold text-base pt-1'><span>Total</span><span>${total}</span></div>
                </div>

                {/* Printer */}
                <div className='mt-4 border-t pt-3 flex items-center justify-between'>
                    <span className='text-sm font-medium'>Printer</span>
                    <span className={`text-xs font-semibold ${
                        printerStatus === 'connected'    ? 'text-green-600' :
                        printerStatus === 'error'        ? 'text-red-500'   : 'text-gray-400'
                    }`}>
                        {printerStatus === 'connected' ? 'Ready' :
                         printerStatus === 'error'     ? 'No printer' : 'Server offline'}
                    </span>
                </div>
                {printerStatus !== 'connected' && (
                    <p className='text-xs text-gray-400 mt-1'>
                        Run <span className='font-mono bg-gray-100 px-1 rounded'>npm run print-server</span> in a terminal to enable printing.
                    </p>
                )}

                {sendError && (
                    <p className='mt-2 text-xs text-red-600 font-medium text-center'>{sendError}</p>
                )}
                <Button onClick={handleSendOrder} className='mt-3 w-full' disabled={orders.length === 0}>
                    Send Order
                </Button>
            </CardContent>
        </Card>
    );

    return (
        <div className='h-full'>
            {/* ── iPhone portrait ── */}
            <div className='[@media(min-width:640px)_and_(orientation:landscape)]:hidden flex flex-col h-full'>
                {/* Tab bar */}
                <div className='flex border-b bg-white shrink-0'>
                    <button
                        onClick={() => setMobileTab('order')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${mobileTab === 'order' ? 'border-b-2 border-black text-black' : 'text-gray-400'}`}
                    >
                        Order
                    </button>
                    <button
                        onClick={() => setMobileTab('history')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${mobileTab === 'history' ? 'border-b-2 border-black text-black' : 'text-gray-400'}`}
                    >
                        History
                    </button>
                </div>

                {mobileTab === 'order' ? (
                    <div className='flex-1 overflow-y-auto flex flex-col gap-4 p-4'>
                        <OrderPanel {...orderPanelProps} />
                        {cart}
                    </div>
                ) : (
                    <div ref={mobileHistoryRef} className='flex-1 overflow-y-auto p-4'>
                        <HistorySection
                            title=''
                            sectionKey='mobile-combined'
                            orders={displayOrders}
                            taxRate={TAX_RATE}
                            totalRevenue={totalRevenue}
                            onItemClick={handleItemClick}
                            getItemClassName={getItemClassName}
                            getItemBadge={getItemBadge}
                            getItemTooltip={getItemTooltip}
                            getOrderActions={getOrderActions}
                            getOrderPhone={getOrderPhone}
                            onSavePhone={handleSavePhone}
                        />
                    </div>
                )}
            </div>

            {/* ── iPad landscape: 2-column resizable ── */}
            <div
                ref={containerRef}
                className='hidden [@media(min-width:640px)_and_(orientation:landscape)]:flex h-full select-none'
                onMouseMove={(e) => onDragMove(e.clientX)}
                onMouseUp={() => { isDragging.current = false; }}
                onMouseLeave={() => { isDragging.current = false; }}
                onTouchMove={(e) => onDragMove(e.touches[0].clientX)}
                onTouchEnd={() => { isDragging.current = false; }}
            >
                {/* Left col: Order + Cart */}
                <div
                    style={{ width: `${colSplit}%` }}
                    className='overflow-y-auto p-4 flex flex-col gap-4 shrink-0'
                >
                    <OrderPanel {...orderPanelProps} />
                    {cart}
                </div>

                {/* Drag handle */}
                <div
                    className='w-1.5 bg-gray-200 hover:bg-blue-400 active:bg-blue-500 cursor-col-resize transition-colors shrink-0'
                    onMouseDown={() => { isDragging.current = true; }}
                    onTouchStart={() => { isDragging.current = true; }}
                />

                {/* Right col: Combined history */}
                <div ref={tabletHistoryRef} className='flex-1 overflow-y-auto p-4 min-w-0'>
                    {/* Panel controls + station links */}
                    <div className='flex items-center gap-2 mb-1 flex-wrap'>
                        <span className='text-sm font-semibold text-gray-500'>History</span>

                        {PANELS.filter((p) => visiblePanels.has(p.key)).map((p) => (
                            <span
                                key={p.key}
                                className='inline-flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-0.5 text-xs font-medium'
                            >
                                {p.label}
                                <button
                                    onClick={() => togglePanel(p.key)}
                                    className='text-gray-400 hover:text-gray-700 leading-none'
                                >
                                    ×
                                </button>
                            </span>
                        ))}

                        {hiddenPanels.length > 0 && (
                            <div className='relative'>
                                <button
                                    onClick={() => setShowAddMenu((v) => !v)}
                                    className='w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 text-sm font-bold flex items-center justify-center transition-colors'
                                >
                                    +
                                </button>
                                {showAddMenu && (
                                    <div className='absolute left-0 top-8 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]'>
                                        {hiddenPanels.map((p) => (
                                            <button
                                                key={p.key}
                                                onClick={() => { togglePanel(p.key); setShowAddMenu(false); }}
                                                className='w-full text-left px-3 py-2 text-sm hover:bg-gray-50'
                                            >
                                                {p.label} History
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className='ml-auto flex items-center gap-2'>
                            <span className='text-xs text-gray-400'>Station:</span>
                            <Link href='/order/corndog' className='text-xs font-medium text-orange-600 hover:underline'>Corndog</Link>
                            <Link href='/order/drink' className='text-xs font-medium text-blue-600 hover:underline'>Drink</Link>
                        </div>
                    </div>

                    <HistorySection
                        title=''
                        sectionKey='combined'
                        orders={displayOrders}
                        taxRate={TAX_RATE}
                        totalRevenue={totalRevenue}
                        onItemClick={handleItemClick}
                        getItemClassName={getItemClassName}
                        getItemBadge={getItemBadge}
                        getItemTooltip={getItemTooltip}
                        getOrderActions={getOrderActions}
                        getOrderPhone={getOrderPhone}
                        onSavePhone={handleSavePhone}
                    />
                </div>
            </div>
        </div>
    );
}
