import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  allowedDevOrigins: ["10.212.134.200", "192.168.108.53"],
};

export default nextConfig;
