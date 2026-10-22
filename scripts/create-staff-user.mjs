// Creates (or resets) the one Supabase Auth login the tills use for orders.
// See supabase/migrations/20261022120000_staff_access.sql.
//
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
//   node scripts/create-staff-user.mjs staff@themoontea.example
//
// Prints a new random password. Put the email and password in:
//   - Vercel: STAFF_SUPABASE_EMAIL and STAFF_SUPABASE_PASSWORD (then redeploy)
//   - each iPhone build: Secrets.staffEmail and Secrets.staffPassword
// Running it again for the same email sets a new password, which signs every
// till out of the database until they get the new one.

import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !serviceKey) {
    console.error('Usage: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/create-staff-user.mjs <email>');
    process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomBytes(24).toString('base64url');
// app_metadata is what the database checks (public.is_staff()); only the
// service role can set it, so nobody can sign themselves up as staff.
const attributes = { password, email_confirm: true, app_metadata: { role: 'staff' } };

const { data: created, error } = await supabase.auth.admin.createUser({ email, ...attributes });
if (error) {
    if (!/already (been )?registered|already exists/i.test(error.message)) {
        console.error('Could not create the staff login:', error.message);
        process.exit(1);
    }
    // Already there: find it and reset it.
    let user = null;
    for (let page = 1; !user; page++) {
        const { data, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (listError) throw listError;
        user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (data.users.length < 200) break;
    }
    if (!user) {
        console.error(`${email} is registered but could not be found to reset.`);
        process.exit(1);
    }
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, attributes);
    if (updateError) throw updateError;
    console.log(`Reset the existing staff login ${email}.`);
} else {
    console.log(`Created the staff login ${email} (${created.user.id}).`);
}
console.log(`\nSTAFF_SUPABASE_EMAIL=${email}\nSTAFF_SUPABASE_PASSWORD=${password}\n`);
console.log('Keep the password private: it can read and change every order.');
