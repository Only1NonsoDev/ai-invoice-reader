// Set NEXT_PUBLIC_BASE_PATH (e.g. "/invoice-reader") when hosting under a sub-path such as GitHub Pages.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist optionally requires the Node-only "canvas" package; we only run it in the browser.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
