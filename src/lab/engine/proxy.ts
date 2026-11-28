// Production through a same-origin proxy (/_prod → https://ericajaclyn.com,
// via vercel.json on previews and the Vite proxy in dev). The HTML is
// rendered with srcdoc, which inherits this origin, so DOM switches and
// checks reach production exactly as they reach this build.
//
// Limitation: root-relative url() references *inside* production CSS files
// resolve against this origin. Hashed font/image files usually exist on both;
// if a production-only asset 404s, that is why.

/** Point root-relative URLs in production HTML back through the proxy. */
export function rewriteForProxy(
  html: string,
  prefix: string,
  path: string
): string {
  const fix = (u: string) =>
    u.startsWith("/") && !u.startsWith("//") && !u.startsWith(prefix + "/")
      ? prefix + u
      : u
  let out = html
    .replace(
      /(\s(?:src|href|action|poster|data-src)\s*=\s*)(["'])(.*?)\2/gi,
      (_m, a, q, v) => `${a}${q}${fix(v)}${q}`
    )
    .replace(
      /(\s(?:srcset|imagesrcset)\s*=\s*)(["'])(.*?)\2/gi,
      (_m, a, q, v) =>
        `${a}${q}${String(v)
          .split(",")
          .map((p: string) => fix(p.trim()))
          .join(", ")}${q}`
    )
    .replace(
      /url\((["']?)(\/[^/][^)"']*)\1\)/g,
      (_m, q, v) => `url(${q}${fix(v)}${q})`
    )
  const dir = path.replace(/[^/]*$/, "")
  out = out.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="${prefix}${dir || "/"}">`
  )
  return out
}

/** contentDocument when same-origin and loaded, else null (never throws). */
export function frameDocument(f: HTMLIFrameElement | null): Document | null {
  try {
    const d = f?.contentDocument
    return d && d.body ? d : null
  } catch {
    return null
  }
}
