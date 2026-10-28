// @ts-check

import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import react from "@astrojs/react"

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap"

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
    // /liquidglass stays out until we decide whether it should be public
    sitemap({ filter: (page) => !page.includes("/liquidglass") }),
  ],
})