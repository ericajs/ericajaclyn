# ericajaclyn.com

This is a production-deployed Astro project with React, TypeScript + shadcn/ui (Maia preset) + Tailwind + RTL portfolio, on Vercel, auto-deploying from GitHub, with cursor-pointer patched on Button.



## AI Design Lab

AI Design Lab, a design review and accessibility testing app, is hosted from this site at `/aidesignlab` (like `/threshold`). See [`src/lab/README.md`](src/lab/README.md).

## Adding components

To add components to, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `src/components` directory.

## Using components

To use the components, import them in an `.astro` file:

```astro
---
import { Button } from "@/components/ui/button"
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Astro App</title>
  </head>
  <body>
    <div class="grid h-screen place-items-center content-center">
      <Button>Button</Button>
    </div>
  </body>
</html>
```

---


## Important Project Files!

### `pnpm-lock.yaml`

**Most importantly:** 
- `pnpm-lock.yaml` records the specific versions that got installed, ensuring consistency across machines.
- `package.json` lists the dependencies.

**What `pnpm-lock.yaml` is:**
`pnpm-lock.yaml` is a machine-generated file that records the exact dependency tree installed in the project.

**Why the lockfile matters:**
- **Reproducible installs** – Ensures everyone (laptop, contributors, CI) gets exactly the same dependency versions.
- **Fewer "works on my machine" bugs** – Prevents unexpected transitive dependency updates from breaking the build.
- **Faster installs** – pnpm uses the lockfile so it doesn't need to resolve dependencies from scratch.

**What's inside the lockfile:**
- Specific versions installed (e.g., `astro@6.4.8`)
- Source of each package (npm registry, git, etc.)
- How dependencies relate in the tree
- Integrity hashes for verification

**Updating the lockfile:**
- `pnpm install` — Uses the existing lockfile, doesn’t modify it.
- `pnpm add some-package` — Adds or updates dependencies and updates the lockfile accordingly.
- `pnpm update` — Updates dependency versions and rewrites the lockfile.

---

### `package.json`

**Most importantly:**
- This is the single source of truth for this project’s identity, dependencies, and scripts. 
- It's the first file every tool examines.

**What `package.json` is:**
- `package.json` is a human-edited manifest that defines this project for tools like pnpm, npm, and Vercel. When someone clones the repository and runs `pnpm -install`, pnpm reads this file and installs the listed dependencies.  
- If `pnpm-lock.yaml` is the receipt for what was actually installed, `package.json` is the shopping list and set of instructions.

**What `package.json` does:**
- Declares project metadata (name, version, etc.)
- Lists dependencies:
  - `dependencies`: Needed to run/build the app (Astro, React, Tailwind, fonts, shadcn, etc.)
  - `devDependencies`: Needed only for development (ESLint, Prettier, TypeScript, etc.)
- Defines scripts:
  - `pnpm dev` — Start local dev server
  - `pnpm build` — Production build
  - `pnpm preview` — Preview the production build locally
  - `pnpm lint` — Run ESLint
  - `pnpm format` — Auto-format code with Prettier
  - `pnpm typecheck` — Check TypeScript types
- Sets project rules:
  - `"type": "module"` — Enables ES module syntax (import/export)
  - `engines` — Recommends Node.js version 22.12+ for this project