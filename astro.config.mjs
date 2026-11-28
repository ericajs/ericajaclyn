// @ts-check

import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import react from "@astrojs/react"

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap"
import designLab from "./src/lab/integration.ts"

// https://astro.build/config
export default defineConfig({
  site: "https://ericajaclyn.com",
  // Canonical URLs, og:url and the sitemap all use the no-slash form
  trailingSlash: "never",
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    react(),
    mdx(),
    // AI Design Lab at /aidesignlab — its own app, hosted here like /threshold
    designLab({ prodOrigin: "https://ericajaclyn.com" }),
    // /liquidglass stays out until we decide whether it should be public;
    // /threshold is fiction (invented book and reviews) and is noindex;
    // /aidesignlab stays out until the MVP launches
    sitemap({
      filter: (page) =>
        !page.includes("/liquidglass") &&
        !page.includes("/threshold") &&
        !page.includes("/aidesignlab"),
    }),
  ],
})
