'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const formatCurrency = (value) => {
    if (value === null || value === undefined) return '—';
    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) return '—';

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(numberValue);
};

const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
};

const getFileExtension = (fileName) => {
    const parts = fileName.split('.');
    if (parts.length < 2) return 'jpg';
    return parts[parts.length - 1].toLowerCase();
};

export default function TrackReceiptsPage() {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [session, setSession] = useState(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authMode, setAuthMode] = useState('signin');
    const [authError, setAuthError] = useState('');

    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadError, setUploadError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [processingIds, setProcessingIds] = useState({});

    const [receipts, setReceipts] = useState([]);
    const [loadingReceipts, setLoadingReceipts] = useState(false);
    const [listError, setListError] = useState('');

    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [items, setItems] = useState([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [itemsError, setItemsError] = useState('');

    useEffect(() => {
        let isMounted = true;

        supabase.auth.getSession().then(({ data }) => {
            if (!isMounted) return;
            setSession(data.session ?? null);
        });

        const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession ?? null);
        });

        return () => {
            isMounted = false;
            data?.subscription?.unsubscribe();
        };
    }, [supabase]);

    const resolveImageUrl = async (imagePath) => {
        if (!imagePath) return null;
        if (imagePath.startsWith('http')) return imagePath;

        const { data, error } = await supabase.storage
            .from('receipt-photo')
            .createSignedUrl(imagePath, 60 * 60);

        if (error) {
            return null;
        }

        return data?.signedUrl ?? null;
    };

    const fetchReceipts = async () => {
        setListError('');
        setLoadingReceipts(true);
        const { data, error } = await supabase
            .from('receipts')
            .select(
                'id, image_url, location, total_amount, receipt_datetime, payment_method_type, payment_method_last4, ai_status, ai_confidence, created_at'
            )
            .order('created_at', { ascending: false });

        if (error) {
            setListError(error.message);
            setLoadingReceipts(false);
            return;
        }

        const enriched = await Promise.all(
            (data ?? []).map(async (receipt) => {
                const displayUrl = await resolveImageUrl(receipt.image_url);
                return { ...receipt, display_url: displayUrl };
            })
        );

        setReceipts(enriched);
        setLoadingReceipts(false);
    };

    useEffect(() => {
        if (!session) return;
        fetchReceipts();
    }, [session]);

    useEffect(() => {
        const fetchItems = async () => {
            if (!selectedReceipt?.id) {
                setItems([]);
                return;
            }

            setItemsError('');
            setItemsLoading(true);
            const { data, error } = await supabase
                .from('receipt_items')
                .select('id, item_name, quantity, unit_price, line_total')
                .eq('receipt_id', selectedReceipt.id)
                .order('created_at', { ascending: true });

            if (error) {
                setItemsError(error.message);
                setItemsLoading(false);
                return;
            }

            setItems(data ?? []);
            setItemsLoading(false);
        };

        if (session) {
            fetchItems();
        }
    }, [selectedReceipt, session, supabase]);

    const handleAuth = async (event) => {
        event.preventDefault();
        setAuthError('');

        if (!email || !password) {
            setAuthError('Email and password are required.');
            return;
        }

        const action =
            authMode === 'signup'
                ? supabase.auth.signUp({ email, password })
                : supabase.auth.signInWithPassword({ email, password });

        const { error } = await action;
        if (error) {
            setAuthError(error.message);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setReceipts([]);
        setSelectedReceipt(null);
    };

    const handleUpload = async (event) => {
        event.preventDefault();
        setUploadError('');

        if (!selectedFile) {
            setUploadError('Choose a receipt photo first.');
            return;
        }

        if (!session?.user?.id) {
            setUploadError('You must be signed in.');
            return;
        }

        setUploading(true);

        const receiptId = crypto.randomUUID();
        const extension = getFileExtension(selectedFile.name);
        const filePath = `${session.user.id}/${receiptId}.${extension}`;

        const { error: uploadErrorResponse } = await supabase.storage
            .from('receipt-photo')
            .upload(filePath, selectedFile, {
                contentType: selectedFile.type || 'image/jpeg',
                upsert: false,
            });

        if (uploadErrorResponse) {
            setUploadError(uploadErrorResponse.message);
            setUploading(false);
            return;
        }

        const { error: insertError } = await supabase.from('receipts').insert({
            id: receiptId,
            user_id: session.user.id,
            image_url: filePath,
            ai_status: 'pending',
        });

        if (insertError) {
            await supabase.storage.from('receipt-photo').remove([filePath]);
            setUploadError(insertError.message);
            setUploading(false);
            return;
        }

        await triggerProcessing(receiptId);
        setSelectedFile(null);
        setUploading(false);
        await fetchReceipts();
    };

    const triggerProcessing = async (receiptId) => {
        if (!session?.access_token) return;

        setProcessingIds((prev) => ({ ...prev, [receiptId]: true }));

        const response = await fetch('/api/receipts/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receipt_id: receiptId,
                access_token: session.access_token,
            }),
        });

        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            setUploadError(result.error || 'AI extraction failed.');
        }

        setProcessingIds((prev) => {
            const next = { ...prev };
            delete next[receiptId];
            return next;
        });

        await fetchReceipts();
    };

    if (!session) {
        return (
            <div className='min-h-screen bg-slate-50 px-6 py-10 text-slate-900'>
                <div className='mx-auto max-w-md rounded-xl bg-white p-6 shadow'>
                    <h1 className='text-2xl font-semibold'>Receipt Tracker</h1>
                    <p className='mt-2 text-sm text-slate-600'>
                        Sign in to upload and process your receipts.
                    </p>
                    <form className='mt-6 space-y-4' onSubmit={handleAuth}>
                        <div className='space-y-1'>
                            <label className='text-sm font-medium'>Email</label>
                            <input
                                type='email'
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className='w-full rounded border border-slate-200 p-2'
                                placeholder='you@example.com'
                                required
                            />
                        </div>
                        <div className='space-y-1'>
                            <label className='text-sm font-medium'>Password</label>
                            <input
                                type='password'
                                value={password}
                                onChange={(event) =>
                                    setPassword(event.target.value)
                                }
                                className='w-full rounded border border-slate-200 p-2'
                                placeholder='••••••••'
                                required
                            />
                        </div>
                        {authError && (
                            <p className='rounded bg-red-50 p-2 text-sm text-red-600'>
                                {authError}
                            </p>
                        )}
                        <div className='flex flex-col gap-2'>
                            <button
                                type='submit'
                                className='rounded bg-slate-900 px-4 py-2 text-white'
                            >
                                {authMode === 'signup'
                                    ? 'Create account'
                                    : 'Sign in'}
                            </button>
                            <button
                                type='button'
                                onClick={() =>
                                    setAuthMode(
                                        authMode === 'signup'
                                            ? 'signin'
                                            : 'signup'
                                    )
                                }
                                className='text-sm text-slate-600'
                            >
                                {authMode === 'signup'
                                    ? 'Already have an account? Sign in'
                                    : 'Need an account? Sign up'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className='min-h-screen bg-slate-50 px-6 py-8 text-slate-900'>
            <div className='mx-auto max-w-6xl space-y-6'>
                <header className='flex flex-wrap items-center justify-between gap-4'>
                    <div>
                        <h1 className='text-3xl font-semibold'>Receipt Tracker</h1>
                        <p className='text-sm text-slate-600'>
                            Upload a receipt and let AI extract the details.
                        </p>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className='rounded border border-slate-200 px-4 py-2 text-sm'
                    >
                        Sign out
                    </button>
                </header>

                <section className='rounded-xl bg-white p-6 shadow'>
                    <h2 className='text-lg font-semibold'>Upload receipt</h2>
                    <form
                        className='mt-4 flex flex-col gap-4 md:flex-row md:items-center'
                        onSubmit={handleUpload}
                    >
                        <input
                            type='file'
                            accept='image/*'
                            onChange={(event) =>
                                setSelectedFile(event.target.files?.[0] ?? null)
                            }
                            className='w-full md:w-auto'
                        />
                        <button
                            type='submit'
                            disabled={uploading}
                            className='rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60'
                        >
                            {uploading ? 'Uploading...' : 'Upload & process'}
                        </button>
                    </form>
                    {uploadError && (
                        <p className='mt-3 rounded bg-red-50 p-2 text-sm text-red-600'>
                            {uploadError}
                        </p>
                    )}
                </section>

                <section className='grid gap-6 lg:grid-cols-[1.4fr_1fr]'>
                    <div className='rounded-xl bg-white p-6 shadow'>
                        <div className='flex items-center justify-between'>
                            <h2 className='text-lg font-semibold'>Receipts</h2>
                            <button
                                onClick={fetchReceipts}
                                className='text-sm text-slate-600'
                            >
                                Refresh
                            </button>
                        </div>
                        {listError && (
                            <p className='mt-2 rounded bg-red-50 p-2 text-sm text-red-600'>
                                {listError}
                            </p>
                        )}
                        {loadingReceipts ? (
                            <p className='mt-4 text-sm text-slate-500'>
                                Loading receipts...
                            </p>
                        ) : receipts.length === 0 ? (
                            <p className='mt-4 text-sm text-slate-500'>
                                No receipts yet.
                            </p>
                        ) : (
                            <div className='mt-4 space-y-4'>
                                {receipts.map((receipt) => (
                                    <button
                                        key={receipt.id}
                                        type='button'
                                        onClick={() => setSelectedReceipt(receipt)}
                                        className='flex w-full flex-col gap-3 rounded-lg border border-slate-100 p-3 text-left transition hover:border-slate-200'
                                    >
                                        <div className='flex gap-4'>
                                            <div className='h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100'>
                                                {receipt.display_url ? (
                                                    <img
                                                        src={receipt.display_url}
                                                        alt='Receipt thumbnail'
                                                        className='h-full w-full object-cover'
                                                    />
                                                ) : (
                                                    <div className='flex h-full w-full items-center justify-center text-xs text-slate-500'>
                                                        No image
                                                    </div>
                                                )}
                                            </div>
                                            <div className='flex-1 space-y-1'>
                                                <p className='text-sm font-semibold'>
                                                    {receipt.location || 'Unknown location'}
                                                </p>
                                                <p className='text-sm text-slate-600'>
                                                    {formatCurrency(receipt.total_amount)}
                                                </p>
                                                <p className='text-xs text-slate-500'>
                                                    {formatDateTime(
                                                        receipt.receipt_datetime
                                                    )}
                                                </p>
                                                <p className='text-xs text-slate-500'>
                                                    {receipt.payment_method_type
                                                        ? `${receipt.payment_method_type.toUpperCase()} ${receipt.payment_method_last4 || ''}`
                                                        : 'Payment method unknown'}
                                                </p>
                                            </div>
                                            <div className='flex flex-col items-end gap-2 text-xs'>
                                                <span className='rounded-full bg-slate-100 px-2 py-1 text-slate-600'>
                                                    {receipt.ai_status}
                                                </span>
                                                <button
                                                    type='button'
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        triggerProcessing(receipt.id);
                                                    }}
                                                    disabled={processingIds[receipt.id]}
                                                    className='text-xs text-emerald-700'
                                                >
                                                    {processingIds[receipt.id]
                                                        ? 'Processing...'
                                                        : 'Run AI'}
                                                </button>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className='rounded-xl bg-white p-6 shadow'>
                        <h2 className='text-lg font-semibold'>Details</h2>
                        {!selectedReceipt ? (
                            <p className='mt-4 text-sm text-slate-500'>
                                Select a receipt to view line items.
                            </p>
                        ) : (
                            <div className='mt-4 space-y-4'>
                                <div className='space-y-1'>
                                    <p className='text-sm font-semibold'>
                                        {selectedReceipt.location ||
                                            'Unknown location'}
                                    </p>
                                    <p className='text-sm text-slate-600'>
                                        {formatCurrency(
                                            selectedReceipt.total_amount
                                        )}
                                    </p>
                                    <p className='text-xs text-slate-500'>
                                        {formatDateTime(
                                            selectedReceipt.receipt_datetime
                                        )}
                                    </p>
                                </div>
                                {itemsError && (
                                    <p className='rounded bg-red-50 p-2 text-sm text-red-600'>
                                        {itemsError}
                                    </p>
                                )}
                                {itemsLoading ? (
                                    <p className='text-sm text-slate-500'>
                                        Loading items...
                                    </p>
                                ) : items.length === 0 ? (
                                    <p className='text-sm text-slate-500'>
                                        No line items found.
                                    </p>
                                ) : (
                                    <div className='space-y-3'>
                                        {items.map((item) => (
                                            <div
                                                key={item.id}
                                                className='flex items-center justify-between border-b border-slate-100 pb-2 text-sm'
                                            >
                                                <div>
                                                    <p className='font-medium'>
                                                        {item.item_name}
                                                    </p>
                                                    <p className='text-xs text-slate-500'>
                                                        Qty {item.quantity} @{' '}
                                                        {formatCurrency(
                                                            item.unit_price
                                                        )}
                                                    </p>
                                                </div>
                                                <div className='text-sm font-semibold'>
                                                    {formatCurrency(
                                                        item.line_total
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}