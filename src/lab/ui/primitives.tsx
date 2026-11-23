import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

type IconSvg = Parameters<typeof HugeiconsIcon>[0]["icon"]

export function Icon({ icon, size = 16 }: { icon: IconSvg; size?: number }) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={1.6}
      aria-hidden="true"
    />
  )
}

export function IconButton({
  icon,
  label,
  onClick,
  pressed,
  shortcut,
  disabled,
  size = 16,
  className = "",
}: {
  icon: IconSvg
  label: string
  onClick?: () => void
  pressed?: boolean
  shortcut?: string
  disabled?: boolean
  size?: number
  className?: string
}) {
  return (
    <button
      type="button"
      className={`lab-icon-btn ${className}`}
      aria-label={label}
      aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon icon={icon} size={size} />
    </button>
  )
}

export function Btn({
  children,
  onClick,
  variant = "outline",
  type = "button",
  disabled,
  title,
  className = "",
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "outline" | "ghost" | "danger"
  type?: "button" | "submit"
  disabled?: boolean
  title?: string
  className?: string
}) {
  return (
    <button
      type={type}
      className={`lab-btn lab-btn-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  )
}

/** Radio-group semantics: one of n, arrow keys move. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
  size?: "sm" | "md"
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0
    if (!d) return
    e.preventDefault()
    const n = (i + d + options.length) % options.length
    onChange(options[n].value)
    refs.current[n]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`lab-seg lab-seg-${size}`}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          title={o.title}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** WAI-ARIA tabs pattern with automatic activation. */
export function Tabs<T extends string>({
  value,
  tabs,
  onChange,
  label,
  idBase,
}: {
  value: T
  tabs: { value: T; label: ReactNode; badge?: number }[]
  onChange: (v: T) => void
  label: string
  idBase: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div role="tablist" aria-label={label} className="lab-tabs">
      {tabs.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          role="tab"
          type="button"
          id={`${idBase}-tab-${t.value}`}
          aria-controls={`${idBase}-panel-${t.value}`}
          aria-selected={t.value === value}
          tabIndex={t.value === value ? 0 : -1}
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => {
            const d =
              e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
            if (!d) return
            e.preventDefault()
            const n = (i + d + tabs.length) % tabs.length
            onChange(tabs[n].value)
            refs.current[n]?.focus()
          }}
        >
          {t.label}
          {t.badge ? <span className="lab-badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

/** Disclosure popover: Escape and outside click close it, focus returns to the trigger. */
export function Popover({
  trigger,
  children,
  label,
  align = "start",
  className = "",
}: {
  trigger: (props: {
    onClick: () => void
    "aria-expanded": boolean
    "aria-controls": string
  }) => ReactNode
  children: (close: () => void) => ReactNode
  label: string
  align?: "start" | "end"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        ;(
          root.current?.querySelector("[aria-expanded]") as HTMLElement | null
        )?.focus()
      }
    }
    document.addEventListener("mousedown", down)
    document.addEventListener("keydown", key)
    return () => {
      document.removeEventListener("mousedown", down)
      document.removeEventListener("keydown", key)
    }
  }, [open])
  return (
    <div className="lab-popover-root" ref={root}>
      {trigger({
        onClick: () => setOpen((o) => !o),
        "aria-expanded": open,
        "aria-controls": id,
      })}
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={`lab-popover lab-popover-${align} ${className}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Native modal dialog: focus trap, Escape and inert background come from the platform. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const hid = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`lab-dialog ${wide ? "lab-dialog-wide" : ""}`}
      onClose={onClose}
      aria-labelledby={hid}
    >
      <div className="lab-dialog-head">
        <h2 id={hid}>{title}</h2>
        <button
          type="button"
          className="lab-icon-btn"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="lab-dialog-body">{open && children}</div>
    </dialog>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="lab-field">
      <span className="lab-field-label">{label}</span>
      {children}
      {hint && <span className="lab-field-hint">{hint}</span>}
    </label>
  )
}
