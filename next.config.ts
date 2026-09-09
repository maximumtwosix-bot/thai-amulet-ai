import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // E.7-QA Strategy 4 experiment — excludes pdfjs-dist from Turbopack/webpack server-side
  // bundling; Node's own native module loader handles it directly against the real, unmodified
  // files in node_modules, so its internal relative dynamic import ("./pdf.worker.mjs") resolves
  // exactly as it does under plain Node (where it has always worked).
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
