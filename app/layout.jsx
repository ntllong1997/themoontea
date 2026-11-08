import '@/assets/styles/globals.css';

// Each page sets its own title; this fills in the rest ("Menu Items · The Moon Tea").
export const metadata = {
    title: { default: 'The Moon Tea', template: '%s · The Moon Tea' },
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
};

const MainLayout = ({ children }) => {
    return (
        // Browser extensions (Grammarly, dark-mode and translate tools) stamp their
        // own attributes on <html> and <body> before React loads. Ignore those two
        // tags' attributes only; mismatches anywhere inside are still reported.
        <html lang='en' className='h-full' suppressHydrationWarning>
            <body className='h-full' suppressHydrationWarning>
                {/* The page's one main landmark; pages use plain containers inside it. */}
                <main className='h-full'>{children}</main>
            </body>
        </html>
    );
};

export default MainLayout;
