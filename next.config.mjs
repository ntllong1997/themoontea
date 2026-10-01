// Menu photos uploaded at /admin/menu are served from this project's
// Supabase storage, so next/image has to be allowed to fetch from there.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: supabaseUrl
            ? [
                  {
                      protocol: supabaseUrl.protocol.replace(':', ''),
                      hostname: supabaseUrl.hostname,
                      port: supabaseUrl.port,
                      pathname: '/storage/v1/object/public/menu-photos/**',
                  },
              ]
            : [],
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Frame-Options',           value: 'DENY' },
                    { key: 'X-Content-Type-Options',    value: 'nosniff' },
                    { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
                ],
            },
        ];
    },
};

export default nextConfig;
