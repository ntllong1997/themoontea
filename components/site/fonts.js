// The customer sites' fonts (/menu and /shop), matched to the printed menus.
// Each site's layout puts `siteFontVariables` on its wrapper; Tailwind's
// font-display / font-script / font-body read the variables.
import { Abril_Fatface, Nunito, Playfair_Display } from 'next/font/google';

const display = Abril_Fatface({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const script = Playfair_Display({ style: 'italic', subsets: ['latin'], variable: '--font-script' });
const body = Nunito({ subsets: ['latin'], variable: '--font-body' });

export const siteFontVariables = `${display.variable} ${script.variable} ${body.variable}`;
