import type { NextConfig } from "next";
import {
  getServerActionAllowedOrigins,
  type ServerActionAllowedOriginsEnv
} from "./config/server-actions";

export function createNextConfig(
  env: NodeJS.ProcessEnv | ServerActionAllowedOriginsEnv = process.env
): NextConfig {
  return {
    experimental: {
      serverActions: {
        allowedOrigins: getServerActionAllowedOrigins(env)
      }
    }
  };
}

const nextConfig = createNextConfig();

export default nextConfig;
