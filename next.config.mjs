/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep @sparticuz/chromium out of the server bundle. Webpack/Vercel
  // tracing relocates the package and shatters the relative path
  // chromium uses to find its bundled binary at runtime
  // ("/var/task/node_modules/@sparticuz/chromium/bin does not exist").
  // Marking it external preserves the on-disk layout so
  // `chromium.executablePath()` resolves correctly.
  experimental: {
    // Next 14 honors this list for the server build — it tells Next not
    // to bundle / re-trace these packages so chromium's bundled binary
    // and puppeteer-core's launchers stay at their on-disk paths.
    serverComponentsExternalPackages: [
      "@sparticuz/chromium",
      "puppeteer-core",
    ],
    // Enables `src/instrumentation.ts` to run at boot. We use it to
    // fail loud on missing prod env vars (see that file's header).
    // Next 14.2 requires this opt-in; Next 15+ makes it default-on.
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        "@sparticuz/chromium": "commonjs @sparticuz/chromium",
        "puppeteer-core": "commonjs puppeteer-core",
      });
    }
    return config;
  },
};

export default nextConfig;
