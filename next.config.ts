import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force trailing slashes to prevent dots being interpreted as file extensions
  trailingSlash: true,
};

export default nextConfig;
