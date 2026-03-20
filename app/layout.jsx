import Navbar from '@/components/Navbar';
import Contact from '@/components/Contact';
import '@/assets/styles/globals.css';

export const viewport = {
    width: 'device-width',
    initialScale: 1,
};

const MainLayout = ({ children }) => {
    return (
        <html>
            <body>
                {/* <Navbar /> */}
                <main>{children}</main>
            </body>
        </html>
    );
};

export default MainLayout;
