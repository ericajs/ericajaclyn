// Site navigation, shared by navBar (NavBar.astro) and navMenu (NavMenu.astro)
// so both render the same links in the same order.
export const primaryNav = [
  { href: "/uxdesign", label: "UX Design" },
  { href: "/space", label: "Space" },
]
export const secondaryNav = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
]

export const isActivePath = (currentPath: string, href: string) =>
  href === "/" ? currentPath === "/" : currentPath.startsWith(href)

// Header buttons: no fill on hover; the label/icon color drops to 90%
// opacity instead. (pill-ghost elsewhere keeps its hover fill.)
export const navHover = "text-foreground hover:text-foreground/90"
export const navLink = `pill ${navHover}`
