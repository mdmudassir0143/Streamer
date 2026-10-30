/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a verification build go to a separate folder without disturbing a running `next start`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  devIndicators: false,
  webpack: (config) => {
    // wagmi/walletconnect optional deps we don't use
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.fallback = { ...config.resolve.fallback, '@react-native-async-storage/async-storage': false };
    return config;
  },
};
export default nextConfig;
