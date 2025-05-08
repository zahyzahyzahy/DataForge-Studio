import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
   webpack: (config, { isServer }) => {
    // Ensures that 'proj4' is treated as an external module on the server-side
    // and included in the client-side bundle. This might be needed if Turbopack
    // has issues with how proj4 is packaged or if it's intended for specific environments.
    if (!isServer) {
      // For client-side, ensure it's bundled.
      // No specific client-side config needed for proj4 usually, unless there are specific bundling issues.
    }
    // For Turbopack specific configurations, you might need to check its documentation.
    // The `transpilePackages` option in next.config.js is often used for similar purposes with Turbopack.
    return config;
  },
  // If using Turbopack and encountering issues with proj4, you might need:
  // experimental: {
  //   turbo: {
  //     rules: {
  //       '*.node': {
  //         loaders: ['node-loader'],
  //         as: '*.node',
  //       },
  //     },
  //   },
  // },
};

export default nextConfig;
