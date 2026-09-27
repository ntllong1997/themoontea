'use client';

// PIN sign-in for the menu editor. Only admins get through; the PIN is handed
// up because the database re-checks it on every save (see save_menu).
import { useEffect, useState } from 'react';
import { getEmployees, verifyPin } from '@/lib/employeesDb';
import { Button } from '@/components/ui/Button';

export default function AdminLogin({ onSignIn }) {
    const [admins, setAdmins] = useState(null);
    const [employeeId, setEmployeeId] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isChecking, setIsChecking] = useState(false);

    useEffect(() => {
        getEmployees().then((employees) => {
            const list = employees.filter((e) => e.role === 'admin');
            setAdmins(list);
            if (list.length === 1) setEmployeeId(list[0].id);
        });
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!employeeId || !pin) return;

        setIsChecking(true);
        setError('');
        try {
            const employee = await verifyPin(employeeId, pin);
            if (employee?.role === 'admin') {
                onSignIn({ employee, pin });
                return;
            }
            setError('Wrong PIN, or this person is not an admin.');
        } catch (signInError) {
            console.error('menu sign-in:', signInError);
            setError('Could not check the PIN. Check the internet connection.');
        } finally {
            setIsChecking(false);
            setPin('');
        }
    };

    if (admins === null) {
        return <p role='status' className='text-sm text-gray-500'>Loading…</p>;
    }
    if (admins.length === 0) {
        return (
            <p className='text-sm text-gray-700'>
                No admin exists yet. Add one on the Inventory page → Employees tab first.
            </p>
        );
    }

    return (
        <form onSubmit={handleSubmit} className='flex max-w-sm flex-col gap-3'>
            <label className='text-sm font-medium text-gray-700'>
                Admin
                <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className='mt-1 w-full rounded-lg border border-gray-300 px-3 py-2'
                >
                    <option value=''>Choose…</option>
                    {admins.map((admin) => (
                        <option key={admin.id} value={admin.id}>{admin.name}</option>
                    ))}
                </select>
            </label>
            <label className='text-sm font-medium text-gray-700'>
                PIN
                <input
                    type='password'
                    inputMode='numeric'
                    autoComplete='off'
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className='mt-1 w-full rounded-lg border border-gray-300 px-3 py-2'
                />
            </label>
            {error && <p role='alert' className='text-sm text-red-600'>{error}</p>}
            <Button type='submit' disabled={!employeeId || !pin || isChecking}>
                {isChecking ? 'Checking…' : 'Edit menu'}
            </Button>
        </form>
    );
}
