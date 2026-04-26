/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy all /api/proxy/* requests to the Rind proxy server.
  // This avoids CORS issues and lets the dashboard work without server config changes.
  async rewrites() {
    const proxyUrl = process.env['PROXY_URL'] ?? 'http://localhost:7777';
    return [
      {
        source: '/api/proxy/:path*',
        destination: `${proxyUrl}/:path*`,
      },
      // Browsers request /favicon.ico directly regardless of <link> tags.
      // Rewrite to the SVG icon so there's no 404 in the console.
      {
        source: '/favicon.ico',
        destination: '/icon.svg',
      },
    ];
  },
};

module.exports = nextConfig;
