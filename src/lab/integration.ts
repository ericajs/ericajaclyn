// Design Lab Astro integration.
//
// The lab is a private review tool, so it is only built where it is useful:
//   • `astro dev` — always
//   • Vercel preview deployments (VERCEL_ENV=preview) — yes; Vercel
//     Deployment Protection decides who can open them
//   • Vercel production (VERCEL_ENV=production) — no
// Override with LAB=1 (force on) or LAB=0 (force off).
//
// Candidate designs: any src/lab/designs/<name>.astro becomes /lab/designs/<name>.

import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { AstroIntegration } from "astro"

export function labEnabled(command: string): boolean {
  const flag = process.env.LAB
  if (flag === "1") return true
  if (flag === "0") return false
  return command === "dev" || process.env.VERCEL_ENV !== "production"
}

export default function designLab(opts: {
  prodOrigin: string
}): AstroIntegration {
  return {
    name: "design-lab",
    hooks: {
      "astro:config:setup": ({
        command,
        injectRoute,
        updateConfig,
        logger,
        config,
      }) => {
        if (!labEnabled(command)) {
          logger.info("Design Lab is off for this build (production)")
          return
        }
        injectRoute({
          pattern: "/lab",
          entrypoint: new URL("./pages/index.astro", import.meta.url),
        })
        injectRoute({
          pattern: "/lab/frame/[component]/[perm]",
          entrypoint: new URL("./pages/frame.astro", import.meta.url),
        })

        const designs = new URL("./designs/", import.meta.url)
        try {
          for (const f of readdirSync(fileURLToPath(designs))) {
            if (!f.endsWith(".astro")) continue
            injectRoute({
              pattern: `/lab/designs/${f.replace(/\.astro$/, "")}`,
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
          `Design Lab on at ${config.base.replace(/\/$/, "")}/lab — production proxy → ${target}`
        )
      },
    },
  }
}
