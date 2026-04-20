/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy all /api/proxy/* requests to the Aegis proxy server.
  // This avoids CORS issues and lets the dashboard work without server config changes.
  async rewrites() {
    const proxyUrl = process.env['PROXY_URL'] ?? 'http://localhost:7777';
    return [
      {
        source: '/api/proxy/:path*',
        destination: `${proxyUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
