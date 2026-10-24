/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    user: import('./lib/types').User | null;
    localPreview: boolean;
    friendImages: import('./lib/types').Promotion[];
    usedPromotionCompanies: Set<string>;
    promotionPlacements: Map<string, import('./lib/types').Promotion | undefined>;
  }
}
declare namespace Cloudflare {
  interface Env {
    DB: import('@cloudflare/workers-types').D1Database;
    MEDIA: import('@cloudflare/workers-types').R2Bucket;
    APP_ENV: string;
    AUTH_PEPPER: string;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
  }
}
declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}
