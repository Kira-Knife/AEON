import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // @wagmi/connectors ships a baseAccount connector that pulls in
    // @base-org/account → @coinbase/cdp-sdk → @x402/* packages
    // which are not installed and not needed for this project.
    // Cut the entire chain at the connector level.
    config.resolve.alias = {
      ...config.resolve.alias,
      // Stub the whole baseAccount connector module
      "@wagmi/connectors/dist/esm/baseAccount": false,
      // Stub the cdp-sdk which is the real culprit
      "@coinbase/cdp-sdk": false,
      "@base-org/account": false,
      // Stub all @x402/* sub-paths that get dynamically imported
      "@x402/core/client": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/upto/client": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
};

export default nextConfig;
