import { redirect } from 'next/navigation';

// The site's front door is the shop's customer page. Staff reach their pages
// through /login (or any staff link, which asks for the password first), and
// land on the /vendor hub after signing in.
export default function Root() {
    redirect('/shop');
}
