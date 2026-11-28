// Screenshots live in IndexedDB, not localStorage (5 MB would fill after a
// handful of pastes). Refs: "idb:<id>" in this browser, "asset:<file>" once
// Claude has merged a handoff into the repo.

const DB = "design-lab"
const STORE = "images"
let dbp: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbp
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export async function putImage(
  blob: Blob,
  id = `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
): Promise<string> {
  await tx("readwrite", (s) => s.put(blob, id))
  return `idb:${id}`
}

const urls = new Map<string, string>()

// Images merged into the repo by `scripts/lab.mjs merge` live in
// src/lab/projects/<project>/assets/ and are bundled into lab pages only.
const ASSETS = import.meta.glob<string>("../projects/*/assets/*", {
  query: "?url",
  import: "default",
  eager: true,
})

export async function imageUrl(
  ref: string,
  projectId: string
): Promise<string | null> {
  if (ref.startsWith("asset:"))
    return ASSETS[`../projects/${projectId}/assets/${ref.slice(6)}`] ?? null
  if (ref.startsWith("data:") || ref.startsWith("/") || ref.startsWith("http"))
    return ref
  if (!ref.startsWith("idb:")) return null
  if (urls.has(ref)) return urls.get(ref)!
  try {
    const blob = await tx<Blob | undefined>("readonly", (s) =>
      s.get(ref.slice(4))
    )
    if (!blob) return null
    const u = URL.createObjectURL(blob)
    urls.set(ref, u)
    return u
  } catch {
    return null
  }
}

export async function imageDataUrl(ref: string): Promise<string | null> {
  if (!ref.startsWith("idb:")) return null
  const blob = await tx<Blob | undefined>("readonly", (s) =>
    s.get(ref.slice(4))
  ).catch(() => undefined)
  if (!blob) return null
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => resolve(null)
    r.readAsDataURL(blob)
  })
}

export async function importDataUrl(
  ref: string,
  dataUrl: string
): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob()
  await putImage(blob, ref.replace(/^idb:/, ""))
}

/** First image on the clipboard event, if any. */
export function clipboardImage(e: ClipboardEvent): File | null {
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.type.startsWith("image/")) return item.getAsFile()
  }
  return null
}

/**
 * Capture a region of this tab as PNG using the Screen Capture API. Chrome
 * shows a permission prompt each time; preferCurrentTab skips the picker.
 * Unlike html2canvas, this captures filters, iframes and overlays exactly
 * as you see them.
 */
export async function captureRegion(el: Element): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser" },
    audio: false,
    preferCurrentTab: true,
  } as DisplayMediaStreamOptions & { preferCurrentTab: boolean })
  try {
    const video = document.createElement("video")
    video.srcObject = stream
    video.muted = true
    await video.play()
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    )
    const rect = el.getBoundingClientRect()
    const sx = video.videoWidth / window.innerWidth
    const sy = video.videoHeight / window.innerHeight
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(rect.width * sx)
    canvas.height = Math.round(rect.height * sy)
    canvas
      .getContext("2d")!
      .drawImage(
        video,
        rect.left * sx,
        rect.top * sy,
        rect.width * sx,
        rect.height * sy,
        0,
        0,
        canvas.width,
        canvas.height
      )
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("capture failed"))),
        "image/png"
      )
    )
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}
