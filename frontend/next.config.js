/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL || 'http://localhost:4000';

module.exports = {
  output: 'standalone',
  reactStrictMode: true,
  // Same-origin proxy so the httpOnly session cookie works without CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
};
