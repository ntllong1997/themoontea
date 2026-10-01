'use client';

// Staff page for the pop-up calendar on the customer menu.

import AdminShell from '@/components/admin/AdminShell';
import PopupsTab from '@/components/admin/PopupsTab';

export default function AdminPopupsPage() {
    return (
        <AdminShell active='popups' title='Pop-up Calendar'>
            <PopupsTab />
        </AdminShell>
    );
}
