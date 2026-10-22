import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://vanityvair.com',
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  devToolbar: { enabled: false },
  server: { host: true, port: 4321 },
});
