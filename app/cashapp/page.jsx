'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'cashappTags';
const ACTIVE_KEY  = 'cashappActive';

function load() {
    if (typeof window === 'undefined') return { tags: [], active: '' };
    try {
        const tags   = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const active = localStorage.getItem(ACTIVE_KEY) || '';
        return { tags, active };
    } catch {
        return { tags: [], active: '' };
    }
}

export default function CashAppPage() {
    const [tags,   setTags]   = useState([]);
    const [active, setActive] = useState('');
    const [input,  setInput]  = useState('');
    const [saved,  setSaved]  = useState(false);

    useEffect(() => {
        const { tags, active } = load();
        setTags(tags);
        setActive(active);
    }, []);

    const persist = (nextTags, nextActive) => {
        localStorage.setItem(STORAGE_KEY,  JSON.stringify(nextTags));
        localStorage.setItem(ACTIVE_KEY,   nextActive);
        setTags(nextTags);
        setActive(nextActive);
    };

    const handleAdd = () => {
        const tag = input.trim().replace(/^@/, '').replace(/^\$/, '');
        if (!tag) return;
        const url = `https://cash.app/$${tag}`;
        if (tags.includes(url)) { setInput(''); return; }
        const nextTags = [...tags, url];
        const nextActive = active || url;
        persist(nextTags, nextActive);
        setInput('');
    };

    const handleRemove = (url) => {
        const nextTags = tags.filter((t) => t !== url);
        const nextActive = active === url ? (nextTags[0] || '') : active;
        persist(nextTags, nextActive);
    };

    const handleSetActive = (url) => {
        localStorage.setItem(ACTIVE_KEY, url);
        setActive(url);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const displayTag = (url) => url.replace('https://cash.app/', '');

    return (
        <div className='min-h-screen bg-gray-50 p-4 max-w-md mx-auto'>
            <div className='flex items-center gap-3 mb-6'>
                <Link href='/order' className='text-gray-400 hover:text-gray-600 text-sm'>← Back</Link>
                <h1 className='text-xl font-bold'>CashApp Tags</h1>
            </div>

            {/* Active tag */}
            <div className='bg-white rounded-xl border p-4 mb-4'>
                <p className='text-xs text-gray-500 mb-1'>Active tag (prints on receipts)</p>
                <p className='text-lg font-bold text-green-600'>
                    {active ? displayTag(active) : <span className='text-gray-400 font-normal'>None selected</span>}
                </p>
                {saved && <p className='text-xs text-green-500 mt-1'>Saved ✓</p>}
            </div>

            {/* Tag list */}
            <div className='space-y-2 mb-4'>
                {tags.length === 0 && (
                    <p className='text-sm text-gray-400 text-center py-4'>No tags yet. Add one below.</p>
                )}
                {tags.map((url) => (
                    <div
                        key={url}
                        className={`flex items-center justify-between bg-white rounded-xl border px-4 py-3 ${
                            active === url ? 'border-green-400' : ''
                        }`}
                    >
                        <span className='font-medium'>{displayTag(url)}</span>
                        <div className='flex gap-2'>
                            {active !== url && (
                                <button
                                    onClick={() => handleSetActive(url)}
                                    className='text-xs px-3 py-1 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200'
                                >
                                    Set active
                                </button>
                            )}
                            {active === url && (
                                <span className='text-xs px-3 py-1 rounded-lg bg-green-500 text-white font-semibold'>
                                    Active ✓
                                </span>
                            )}
                            <button
                                onClick={() => handleRemove(url)}
                                className='text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-50'
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add new tag */}
            <div className='bg-white rounded-xl border p-4'>
                <p className='text-sm font-medium mb-2'>Add CashApp tag</p>
                <div className='flex gap-2'>
                    <div className='flex items-center border rounded-lg px-3 flex-1 focus-within:border-blue-400'>
                        <span className='text-gray-400 font-medium'>$</span>
                        <input
                            type='text'
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            placeholder='TheMoonTea'
                            className='flex-1 py-2 pl-1 text-sm focus:outline-none'
                        />
                    </div>
                    <button
                        onClick={handleAdd}
                        disabled={!input.trim()}
                        className='px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40'
                    >
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
}
