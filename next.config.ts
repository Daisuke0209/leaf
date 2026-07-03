import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Client-only app: everything runs in the browser (GIS auth + Drive REST),
  // so the site is a pure static export — host it anywhere.
  output: "export",
  // Static export can't run the image optimizer; serve images as-is.
  images: { unoptimized: true },
  // Emit /edit/index.html instead of /edit.html so any static host resolves
  // the URL without extensionless-HTML support.
  trailingSlash: true,
  // BlockNote is incompatible with React StrictMode (double-mount breaks the editor)
  reactStrictMode: false,
};

export default nextConfig;
