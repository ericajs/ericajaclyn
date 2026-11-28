// AI Design Lab Astro integration.
//
// AI Design Lab is a standalone app hosted on ericajaclyn.com at LAB_BASE
// (/aidesignlab), like /threshold. It is built everywhere: `astro dev`, Vercel
// previews and production. LAB=0 turns it off for a build.
//
// Candidate designs: any src/lab/designs/<name>.astro becomes
// <LAB_BASE>/designs/<name>.

import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { AstroIntegration } from "astro"
import { LAB_BASE } from "./base"

export function labEnabled(): boolean {
  return process.env.LAB !== "0"
}

export default function designLab(opts: {
  prodOrigin: string
}): AstroIntegration {
  return {
    name: "design-lab",
    hooks: {
      "astro:config:setup": ({ injectRoute, updateConfig, logger, config }) => {
        if (!labEnabled()) {
          logger.info("AI Design Lab is off for this build (LAB=0)")
          return
        }
        injectRoute({
          pattern: LAB_BASE,
          entrypoint: new URL("./pages/index.astro", import.meta.url),
        })
        injectRoute({
          pattern: `${LAB_BASE}/frame/[component]/[perm]`,
          entrypoint: new URL("./pages/frame.astro", import.meta.url),
        })

        const designs = new URL("./designs/", import.meta.url)
        try {
          for (const f of readdirSync(fileURLToPath(designs))) {
            if (!f.endsWith(".astro")) continue
            injectRoute({
              pattern: `${LAB_BASE}/designs/${f.replace(/\.astro$/, "")}`,
              entrypoint: new URL(f, designs),
            })
          }
        } catch {
          /* no candidate designs yet */
        }

        // Production, same-origin, in dev: /_prod/* proxies to the live site so
        // switches can reach into it. On Vercel previews, vercel.json does this.
        const target = process.env.LAB_PROD_ORIGIN ?? opts.prodOrigin
        updateConfig({
          vite: {
            server: {
              proxy: {
                "/_prod": {
                  target,
                  changeOrigin: true,
                  rewrite: (p: string) => p.replace(/^\/_prod/, "") || "/",
                },
              },
            },
          },
        })
        logger.info(
          `AI Design Lab on at ${config.base.replace(/\/$/, "")}${LAB_BASE} — production proxy → ${target}`
        )
      },
    },
  }
}
