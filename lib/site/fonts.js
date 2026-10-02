// The customer site's typefaces, shared by every customer page's layout so the
// menu, online ordering and the loyalty card look like one site.
import { Abril_Fatface, Nunito, Playfair_Display } from 'next/font/google';

const display = Abril_Fatface({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const script = Playfair_Display({ style: 'italic', subsets: ['latin'], variable: '--font-script' });
const body = Nunito({ subsets: ['latin'], variable: '--font-body' });

/** Class names that set the font variables and the cream page. */
export const customerSiteClass = `${display.variable} ${script.variable} ${body.variable} min-h-full bg-moon-cream font-body text-moon-ink`;
