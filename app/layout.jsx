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
        <html lang='en' className='h-full'>
            <body className='h-full'>
                {/* The page's one main landmark; pages use plain containers inside it. */}
                <main className='h-full'>{children}</main>
            </body>
        </html>
    );
};

export default MainLayout;
