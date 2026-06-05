import { createSecurityHeaders } from "@wpmoo/security";
import type { NextConfig } from "next";
import {
  getServerActionAllowedOrigins,
  type ServerActionAllowedOriginsEnv
} from "./config/server-actions";

function toNextHeaderSource(headers: Record<string, string>) {
  return Object.entries(headers).map(([key, value]) => ({
    key,
    value
  }));
}

export function createNextConfig(
  env: NodeJS.ProcessEnv | ServerActionAllowedOriginsEnv = process.env
): NextConfig {
  return {
    async headers() {
      return [
        {
          headers: toNextHeaderSource(
            createSecurityHeaders({
              environment: "development"
            })
          ),
          source: "/(.*)"
        }
      ];
    },
    experimental: {
      serverActions: {
        allowedOrigins: getServerActionAllowedOrigins(env)
      }
    }
  };
}

const nextConfig = createNextConfig();

export default nextConfig;
