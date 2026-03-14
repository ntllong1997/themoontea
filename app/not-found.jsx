export default function NotFound() {
    return (
        <main className='flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4'>
            <h1 className='text-6xl font-bold text-gray-900'>404</h1>
            <p className='mt-2 text-gray-500'>Page not found.</p>
            <a href='/' className='mt-6 rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800'>
                Go home
            </a>
        </main>
    );
}
