import type { NextConfig } from "next";
import { getServerActionAllowedOrigins } from "./config/server-actions";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: getServerActionAllowedOrigins(process.env)
    }
  }
};

export default nextConfig;
