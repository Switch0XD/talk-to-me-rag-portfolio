import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/chat": [
      "src/data/local-models/**/*",
      // The ONNX runtime's .node binding loads libonnxruntime.so.1 by relative
      // path at runtime, so file tracing cannot see it. Without it the route
      // fails on Vercel (Linux) with "libonnxruntime.so.1: cannot open shared
      // object file", even though it works on Windows and macOS.
      "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/*",
      // transformers.js also loads sharp, which has the same hidden .so layout.
      "node_modules/@huggingface/transformers/node_modules/@img/sharp-linux-x64/**/*",
      "node_modules/@huggingface/transformers/node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
