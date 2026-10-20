// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import motionPreload from './integrations/motion-preload.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://tallnest.com',
  // Keyword-matched URL for distributor recruitment. Astro serves a 301 in dev
  // and emits a redirect page in the static build; vercel.json issues a true
  // edge 301 in production.
  redirects: {
    '/distributors': { status: 301, destination: '/partners' },
  },
  integrations: [sitemap(), motionPreload()],
  vite: {
    plugins: [tailwindcss()],
  },
});
