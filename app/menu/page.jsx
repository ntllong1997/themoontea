'use client';

// /menu — admins edit what the tills sell: names, prices, choices, order, and
// which items are on the menu. Saved to Supabase `menu_config`; every till
// (web and iPad) picks the change up within about a minute.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminLogin from '@/components/menu/AdminLogin';
import CategoryEditor from '@/components/menu/CategoryEditor';
import { Button } from '@/components/ui/Button';
import { DEFAULT_MENU_CONFIG } from '@/lib/menu/defaultMenu';
import { parseMenuConfig } from '@/lib/menu/menuConfig';
import { addCategory } from '@/lib/menu/menuDraft';
import { fetchMenuRow, saveMenuConfig } from '@/lib/menu/menuDb';

const formatTime = (iso) => new Date(iso).toLocaleString();

/** The menu to start editing from, or an error — never a silent default. */
async function loadStartingMenu() {
    const row = await fetchMenuRow();
    if (!row) return { config: DEFAULT_MENU_CONFIG, info: 'No saved menu yet — starting from the built-in one.' };

    const { config } = parseMenuConfig(row.config);
    if (!config) return { config: DEFAULT_MENU_CONFIG, info: 'The saved menu was unreadable — starting from the built-in one.' };

    const by = row.updatedBy ? ` by ${row.updatedBy}` : '';
    return { config, info: `Last saved ${formatTime(row.updatedAt)}${by}.` };
}

function MenuEditor({ session }) {
    const [baseline, setBaseline] = useState(null);
    const [draft, setDraft] = useState(null);
    const [info, setInfo] = useState('');
    const [loadError, setLoadError] = useState('');
    const [saveErrors, setSaveErrors] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [newItemName, setNewItemName] = useState('');

    const load = useCallback(async () => {
        setLoadError('');
        try {
            const { config, info: loadedInfo } = await loadStartingMenu();
            setBaseline(config);
            setDraft(config);
            setInfo(loadedInfo);
        } catch (error) {
            // Editing on top of the built-in menu here could overwrite real
            // edits on save, so refuse until the saved menu can be read.
            console.error('menu editor load:', error);
            setLoadError('Could not load the saved menu. Check the internet connection.');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const validation = useMemo(() => (draft ? parseMenuConfig(draft) : null), [draft]);
    const isDirty = useMemo(
        () => draft !== null && JSON.stringify(draft) !== JSON.stringify(baseline),
        [draft, baseline]
    );
    const savedKeys = useMemo(() => new Set(baseline?.categories.map((c) => c.key) ?? []), [baseline]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveErrors([]);
        try {
            const result = await saveMenuConfig({
                employeeId: session.employee.id,
                pin: session.pin,
                config: draft,
            });
            if (!result.ok) {
                setSaveErrors(result.errors);
                return;
            }
            const saved = parseMenuConfig(draft).config;
            setBaseline(saved);
            setDraft(saved);
            setInfo(`Saved ${formatTime(result.savedAt)} by ${session.employee.name}. Tills update within a minute.`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddItem = (event) => {
        event.preventDefault();
        if (!newItemName.trim()) return;
        setDraft((d) => addCategory(d, newItemName));
        setNewItemName('');
    };

    if (loadError) {
        return (
            <div className='flex flex-col items-start gap-3'>
                <p role='alert' className='text-sm text-red-600'>{loadError}</p>
                <Button onClick={load}>Try again</Button>
            </div>
        );
    }
    if (!draft) return <p role='status' className='text-sm text-gray-500'>Loading menu…</p>;

    const errors = validation?.errors ?? [];

    return (
        <div className='flex flex-col gap-4'>
            <p className='text-sm text-gray-600'>{info}</p>

            {draft.categories.map((category, index) => (
                <CategoryEditor
                    key={category.key}
                    category={category}
                    index={index}
                    count={draft.categories.length}
                    isNew={!savedKeys.has(category.key)}
                    onEdit={setDraft}
                />
            ))}

            <form onSubmit={handleAddItem} className='flex flex-wrap gap-2'>
                <input
                    aria-label='New item name'
                    placeholder='New item, e.g. Mochi Donut'
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className='flex-1 min-w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm'
                />
                <Button type='submit' variant='outline' disabled={!newItemName.trim()}>+ Add item</Button>
            </form>

            {/* Sticky so Save is reachable from anywhere in a long menu. */}
            <div className='sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-white/95 px-4 py-3'>
                {[...errors, ...saveErrors].map((error) => (
                    <p key={error} role='alert' className='text-sm text-red-600'>{error}</p>
                ))}
                <div className='flex flex-wrap gap-2'>
                    <Button onClick={handleSave} disabled={!isDirty || errors.length > 0 || isSaving}>
                        {isSaving ? 'Saving…' : 'Save menu'}
                    </Button>
                    <Button variant='outline' onClick={() => { setDraft(baseline); setSaveErrors([]); }} disabled={!isDirty || isSaving}>
                        Discard changes
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function MenuPage() {
    const [session, setSession] = useState(null);

    return (
        <main className='mx-auto max-w-3xl px-4 py-6'>
            <div className='mb-6 flex items-center justify-between gap-4'>
                <h1 className='text-2xl font-bold'>Menu</h1>
                <Link href='/order' className='text-sm text-blue-600 hover:underline'>← Back to till</Link>
            </div>
            {session ? <MenuEditor session={session} /> : <AdminLogin onSignIn={setSession} />}
        </main>
    );
}
