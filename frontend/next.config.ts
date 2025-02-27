import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000",
    NEXT_PUBLIC_HOST_IP: process.env.NEXT_PUBLIC_HOST_IP || "localhost",
  },
};

export default nextConfig;
