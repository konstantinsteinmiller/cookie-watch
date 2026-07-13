/**
 * Crumb Rush — canvas renderer + VFX (Design Rev 5).
 *
 * Pure view layer: reads the engine's per-frame render model (`game`) and the
 * phase, owns NO game logic. The scene is laid out like the design sketches: a
 * kitchen floor running left→right, the Mouse Door at home (left) with its Stage
 * Clear sign, the dessert on its plate at the goal (right), and the Cat-Eyes
 * clock head looming centre-top.
 *
 * The two proximity HUDs from the "Player Harvest and Dessert UI" mockup live
 * here rather than in the DOM because they are world-anchored: a Player Carry UI
 * (`0/3`) floating over the Mouse and a Dessert Node UI (`6/6`) plus the green
 * harvest progress ring floating over the dessert. Both fade in as the Mouse
 * approaches the dessert and fade out again as he walks away.
 *
 * Everything is crisp programmatic vectors so the game is fully playable before
 * any art lands; each sprite has an image-override hook that swaps to a file in
 * `/public/images/props/` the moment one exists (see `imageFor`). DPR scaling is
 * applied by the scene; we draw in CSS pixels.
 */
import {
  game, phase, clock, GOLD_FLASH_MS, FRENZY_ZIPS, FRENZY_STAGES, MAX_SLOTS,
  type FxEvent, type ItemKind
} from '@/use/useCookieGame'
import { prependBaseUrl } from '@/utils/function'

// ─── Layout / geometry ───────────────────────────────────────────────────────
let W = 0
let H = 0
let portrait = true
let unit = 24            // base sizing unit ~ min(W,H)/N
let floorY = 0           // y of the floor the Mouse walks on
let homeX = 0            // x of the Mouse Door (pos 0)
let goalX = 0            // x of the dessert (pos 1)
let headX = 0            // Cat-Eyes head centre
let headY = 0

export const configureGeometry = (w: number, h: number): boolean => {
  if (w <= 0 || h <= 0) return false
  W = w; H = h
  portrait = h >= w
  unit = Math.max(14, Math.min(w, h) / 18)
  floorY = portrait ? H * 0.74 : H * 0.72
  homeX = W * (portrait ? 0.16 : 0.12)
  goalX = W * (portrait ? 0.84 : 0.88)
  headX = W * 0.5
  // The Green/Red Light sits above the ears at `headY - CAT_HEAD_UNITS*1.45`, and
  // it is the single most important read on the screen — so the head can never
  // ride high enough to push it off the top edge.
  const lightRoom = unit * CAT_HEAD_UNITS * 1.45 + unit * 0.9
  headY = Math.max(H * (portrait ? 0.24 : 0.22), lightRoom)
  return true
}

/** Screen x for a continuous track position p∈[0..1] (0 door → 1 dessert). */
const xAt = (p: number): number => homeX + (goalX - homeX) * Math.max(0, Math.min(1, p))

// ─── Image-override registry (vector fallback until art lands) ────────────────
const imgCache = new Map<string, HTMLImageElement | null>()
const imageFor = (name: string): HTMLImageElement | null => {
  if (imgCache.has(name)) return imgCache.get(name) ?? null
  imgCache.set(name, null)
  const img = new Image()
  img.onload = () => imgCache.set(name, img)
  img.onerror = () => imgCache.set(name, null)
  img.src = prependBaseUrl(`images/props/${name}`)
  return null
}
export const warmImages = async (srcs: ReadonlyArray<string>): Promise<void> => {
  for (const s of srcs) imageFor(s)
}
export const warmTileImages = async (): Promise<void> => {
  await warmImages(['cookie.webp', 'mouse.webp', 'cat.webp', 'mouse-hole.webp'])
}

// ─── Mouse skin (cosmetic body colour) ───────────────────────────────────────
let mouseFur = '#b8b3ad'
let mouseFur2 = '#8f8a85'
export const setMouseSkin = (fur: string, fur2?: string): void => {
  mouseFur = fur || '#b8b3ad'
  mouseFur2 = fur2 || shade(mouseFur, -0.18)
}

// ─── Small drawing helpers ───────────────────────────────────────────────────
const shade = (hex: string, amt: number): string => {
  const c = hex.replace('#', '')
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))))
  r = f(r); g = f(g); b = f(b)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}
const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}
const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath()
}

// ─── VFX particle system ─────────────────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; max: number; size: number; color: string
  kind: 'spark' | 'ring' | 'crumb' | 'slash' | 'puff' | 'text' | 'sweat' | 'ash'
  rot?: number; vr?: number; text?: string
}
let particles: Particle[] = []
const MAX_PARTICLES = 260

const burstCrumbs = (x: number, y: number, n: number, spread = 1): void => {
  for (let i = 0; i < n; i++) particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 190 * spread,
    vy: -70 - Math.random() * 150 * spread,
    life: 0,
    max: 640,
    size: unit * (0.1 + Math.random() * 0.15),
    color: ['#c98a3c', '#a86a28', '#e0b070'][i % 3]!,
    kind: 'crumb',
    rot: Math.random() * 6,
    vr: (Math.random() - 0.5) * 10
  })
}

const spawnFx = (e: FxEvent): void => {
  const ax = xAt(e.at)
  switch (e.kind) {
    case 'step': {
      for (let i = 0; i < 3; i++) particles.push({
        x: ax, y: floorY,
        vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30,
        life: 0, max: 320, size: unit * 0.12, color: '#d9c7a0', kind: 'puff'
      })
      break
    }
    case 'crumb':
      burstCrumbs(goalX, floorY - unit * 1.4, 7)
      break
    case 'grab':
      burstCrumbs(ax, floorY - unit * 1.2, 5, 0.7)
      break
    case 'drop':
      burstCrumbs(ax, floorY - unit * 0.6, 3, 0.5)
      break

    // The dessert is completely crumbed — it POOFS (per the mockup).
    case 'poof': {
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 90 + Math.random() * 190
        particles.push({
          x: ax, y: floorY - unit * 1.5,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
          life: 0, max: 760, size: unit * (0.08 + Math.random() * 0.16),
          color: ['#e8d3aa', '#c98a3c', '#fff3d0'][i % 3]!, kind: 'puff'
        })
      }
      particles.push({
        x: ax, y: floorY - unit * 1.5, vx: 0, vy: 0,
        life: 0, max: 480, size: unit * 2.4, color: '#ffe9a8', kind: 'ring'
      })
      break
    }
    case 'deposit': {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2
        particles.push({
          x: homeX, y: floorY,
          vx: Math.cos(a) * (60 + Math.random() * 140),
          vy: -Math.abs(Math.sin(a)) * (110 + Math.random() * 130),
          life: 0, max: 640, size: unit * 0.14, color: '#ffd23c', kind: 'spark'
        })
      }
      break
    }
    // The eye-laser lands: a scorch ring and a shower of debris.
    case 'blast': {
      particles.push({
        x: ax, y: floorY, vx: 0, vy: 0,
        life: 0, max: 420, size: unit * 3.0, color: '#ff5a4d', kind: 'ring'
      })
      for (let i = 0; i < 14; i++) particles.push({
        x: ax, y: floorY,
        vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 220,
        life: 0, max: 520, size: unit * 0.18, color: '#ffb08a', kind: 'puff'
      })
      break
    }
    // A direct hit: the Mouse is vaporized into a cartoony pile of ash (§C).
    case 'ash': {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2
        particles.push({
          x: ax, y: floorY - unit * 0.6,
          vx: Math.cos(a) * (40 + Math.random() * 120),
          vy: Math.sin(a) * 60 - 120 - Math.random() * 90,
          life: 0, max: 900, size: unit * (0.08 + Math.random() * 0.16),
          color: ['#4a4a4a', '#6e6e6e', '#2b2b2b'][i % 3]!, kind: 'ash'
        })
      }
      break
    }
    case 'escape': {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2
        particles.push({
          x: ax, y: floorY - unit,
          vx: Math.cos(a) * 130, vy: Math.sin(a) * 130 - 40,
          life: 0, max: 600, size: unit * 0.18, color: '#9be8a8', kind: 'spark'
        })
      }
      break
    }
    // The Gold Nugget eats a blast and bursts into two pieces.
    case 'shield': {
      particles.push({
        x: ax, y: floorY - unit, vx: 0, vy: 0,
        life: 0, max: 520, size: unit * 2.2, color: '#ffd23c', kind: 'ring'
      })
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2
        particles.push({
          x: ax, y: floorY - unit,
          vx: Math.cos(a) * 180, vy: Math.sin(a) * 180 - 60,
          life: 0, max: 620, size: unit * 0.16, color: '#ffe9a8', kind: 'spark'
        })
      }
      break
    }
    // The Cat's enraged puff of smoke from the nostrils (§G).
    case 'smoke': {
      for (let i = 0; i < 8; i++) particles.push({
        x: headX + (i % 2 ? 1 : -1) * unit * 0.25,
        y: headY + unit * 0.7,
        vx: (i % 2 ? 1 : -1) * (20 + Math.random() * 40), vy: 10 + Math.random() * 20,
        life: 0, max: 760, size: unit * (0.16 + Math.random() * 0.18),
        color: '#d6d6d6', kind: 'puff'
      })
      break
    }
    case 'choke': {
      for (let i = 0; i < 12; i++) particles.push({
        x: W / 2, y: H * 0.46,
        vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 160,
        life: 0, max: 700, size: unit * 0.16, color: '#8fd6ff', kind: 'puff'
      })
      break
    }
  }
  if (particles.length > MAX_PARTICLES) particles = particles.slice(-MAX_PARTICLES)
}

const drainFx = (): void => {
  while (game.fx.length) { const e = game.fx.shift(); if (e) spawnFx(e) }
}

const updateParticles = (ctx: CanvasRenderingContext2D, dt: number): void => {
  const next: Particle[] = []
  for (const p of particles) {
    p.life += dt
    if (p.life >= p.max) continue
    const k = p.life / p.max
    if (p.kind === 'ring') {
      ctx.globalAlpha = (1 - k) * 0.75
      ctx.strokeStyle = p.color
      ctx.lineWidth = unit * 0.18 * (1 - k)
      circle(ctx, p.x, p.y, p.size * (0.3 + k * 1.3))
      ctx.stroke()
    } else if (p.kind === 'slash') {
      ctx.globalAlpha = 1 - k
      ctx.strokeStyle = p.color
      ctx.lineWidth = unit * 0.3 * (1 - k)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * (0.3 + k), -0.6, 0.6); ctx.stroke()
    } else if (p.kind === 'text') {
      p.y += (p.vy * dt) / 1000
      ctx.globalAlpha = 1 - k
      ctx.fillStyle = p.color
      ctx.font = `900 ${Math.round(unit * 0.9)}px Angry, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(p.text || '', p.x, p.y)
    } else {
      // Ash drifts upward and smoke floats; everything else falls.
      p.vy += ((p.kind === 'ash' ? -120 : 560) * dt) / 1000
      p.x += (p.vx * dt) / 1000
      p.y += (p.vy * dt) / 1000
      if (p.rot != null) p.rot += ((p.vr || 0) * dt) / 1000
      ctx.globalAlpha = 1 - k
      ctx.fillStyle = p.color
      if (p.kind === 'crumb') {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot || 0)
        rr(ctx, -p.size, -p.size * 0.7, p.size * 2, p.size * 1.4, p.size * 0.4)
        ctx.fill()
        ctx.restore()
      } else {
        circle(ctx, p.x, p.y, p.size)
        ctx.fill()
      }
    }
    next.push(p)
  }
  particles = next
  ctx.globalAlpha = 1
}

// ─── Scene background (kitchen counter, night) ───────────────────────────────
const drawBackground = (ctx: CanvasRenderingContext2D): void => {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#16331f')
  g.addColorStop(0.5, '#1c3a26')
  g.addColorStop(1, '#0e271a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  const moon = ctx.createRadialGradient(goalX, floorY - unit, 0, goalX, floorY - unit, Math.max(W, H) * 0.5)
  moon.addColorStop(0, 'rgba(120,180,140,0.16)')
  moon.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = moon
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(0, floorY, W, H - floorY)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, floorY)
  ctx.lineTo(W, floorY)
  ctx.stroke()
}

// ─── Mouse Door (home) + Stage Clear sign ────────────────────────────────────
const drawDoor = (ctx: CanvasRenderingContext2D): void => {
  const x = homeX, y = floorY
  ctx.fillStyle = '#23303f'
  rr(ctx, x - unit * 2.0, y - unit * 1.6, unit * 4.0, unit * 1.7, unit * 0.3)
  ctx.fill()
  ctx.fillStyle = '#05080c'
  ctx.beginPath()
  ctx.moveTo(x - unit * 1.0, y)
  ctx.lineTo(x - unit * 1.0, y - unit * 0.8)
  ctx.arc(x, y - unit * 0.8, unit * 1.0, Math.PI, 0)
  ctx.lineTo(x + unit * 1.0, y)
  ctx.closePath(); ctx.fill()
  const g = ctx.createRadialGradient(x, y - unit * 0.3, 0, x, y - unit * 0.3, unit * 1.2)
  g.addColorStop(0, 'rgba(255,200,90,0.22)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fill()
}

/** §E: a little sign beside the door showing this level's min / max requirement.
 *  It stands on the DESSERT side of the hole — planting it on the outer side runs
 *  it off the left edge of the screen on wide layouts. */
const drawClearSign = (ctx: CanvasRenderingContext2D, pass: number, perfect: number): void => {
  const x = homeX + unit * 2.9
  const y = floorY - unit * 2.6
  // post
  ctx.strokeStyle = '#6b4a26'
  ctx.lineWidth = unit * 0.14
  ctx.beginPath()
  ctx.moveTo(x, y + unit * 0.5)
  ctx.lineTo(x, floorY)
  ctx.stroke()
  // board
  const bw = unit * 2.3, bh = unit * 1.1
  ctx.fillStyle = '#c79a5b'
  rr(ctx, x - bw / 2, y - bh, bw, bh, unit * 0.16)
  ctx.fill()
  ctx.strokeStyle = '#6b4a26'
  ctx.lineWidth = unit * 0.08
  ctx.stroke()
  ctx.fillStyle = '#3a2410'
  ctx.font = `900 ${Math.round(unit * 0.55)}px Angry, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${fmt(pass)} / ${fmt(perfect)}`, x - unit * 0.25, y - bh / 2)
  // the little cookie glyph after the numbers
  drawChunkGlyph(ctx, x + unit * 0.8, y - bh / 2, unit * 0.26, 'chunk')
  ctx.textBaseline = 'alphabetic'
}

/** Trim a trailing ".0" — burnt chunks make these values fractional. */
const fmt = (n: number): string => (Math.round(n * 10) / 10).toString()

// ─── The dessert (cookie) ────────────────────────────────────────────────────
/**
 * The dessert is drawn as a scalloped disc: a full circle with one circular BITE
 * subtracted per chunk already harvested. Six chunks taken from a six-chunk
 * cookie leaves nothing — which is exactly when the engine poofs it. This is the
 * "Stages of Level 1 Cookie" progression from the mockup (3/3 → 2/3 → 1/3), and
 * it generalises to any node size for free.
 */
const dessertRadiusAt = (theta: number, r: number, total: number, removed: number): number => {
  if (removed <= 0) return r
  const n = Math.max(1, total)
  const ux = Math.cos(theta), uy = Math.sin(theta)
  const d = r * 0.92          // how far out each bite is centred
  // Bite size is not a free parameter — it follows from the spacing. Neighbouring
  // bites sit 2π/n apart, and a bite of radius `rb` at offset `d` subtends
  // asin(rb/d) either side of its axis. Undersize it and adjacent bites fail to
  // meet, leaving a thin SPIKE of dough standing between them; oversize it past
  // `d` and it swallows the cookie's centre, which strands rays that begin inside
  // the bite and renders a mushroom-on-a-stalk. So: overlap the neighbour by a
  // small margin, and never quite reach the middle.
  const rb = d * Math.min(0.985, Math.sin(Math.PI / n) * 1.15)
  let best = r
  for (let i = 0; i < removed; i++) {
    // Bites march around the rim in order. (An every-other-one stride wraps and
    // collides with itself once the node has 4+ chunks, so later bites would
    // land exactly on earlier ones and simply never show up.)
    const a = (i / n) * Math.PI * 2 + 0.7
    const cx = Math.cos(a) * d, cy = Math.sin(a) * d
    const b = ux * cx + uy * cy                 // ray·centre
    const disc = b * b - (cx * cx + cy * cy) + rb * rb
    if (disc <= 0) continue
    const t1 = b - Math.sqrt(disc)              // where the ray enters the bite
    if (t1 > 0 && t1 < best) best = t1
  }
  return Math.max(0, best)
}

const dessertPath = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, total: number, removed: number): void => {
  const steps = 84
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2
    const rad = dessertRadiusAt(th, r, total, removed)
    const px = x + Math.cos(th) * rad
    const py = y + Math.sin(th) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

const drawDessert = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, total: number, left: number): void => {
  if (left <= 0) return
  const removed = Math.max(0, total - left)
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r)
  g.addColorStop(0, '#e3b873')
  g.addColorStop(1, '#b07c3a')
  dessertPath(ctx, x, y, r, total, removed)
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = '#8a5d28'
  ctx.lineWidth = Math.max(1.5, r * 0.05)
  ctx.stroke()

  // Chocolate chips — only the ones still on the surviving dough.
  ctx.fillStyle = '#4a2b16'
  const chips = 10
  for (let i = 0; i < chips; i++) {
    const a = (i / chips) * Math.PI * 2 + 0.35
    const cr = r * (0.25 + ((i * 7) % 5) * 0.13)
    if (cr > dessertRadiusAt(a, r, total, removed) - r * 0.1) continue
    circle(ctx, x + Math.cos(a) * cr, y + Math.sin(a) * cr, r * 0.09)
    ctx.fill()
  }
}

/** The Gold Nugget: a chunky, faceted rock that glitters. */
const drawNugget = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number): void => {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r)
  g.addColorStop(0, '#fff0a8')
  g.addColorStop(0.55, '#ffcd2e')
  g.addColorStop(1, '#b07a08')
  ctx.fillStyle = g
  ctx.beginPath()
  const facets = 7
  for (let i = 0; i <= facets; i++) {
    const a = (i / facets) * Math.PI * 2
    const rad = r * (0.78 + ((i * 3) % 4) * 0.09)
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad
    if (i === 0) {
      ctx.moveTo(px, py)
    } else {
      ctx.lineTo(px, py)
    }
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#8a5d08'
  ctx.lineWidth = Math.max(1, r * 0.1)
  ctx.stroke()
  // sparkle
  const tw = 0.5 + 0.5 * Math.sin(now / 180)
  ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * tw})`
  ctx.lineWidth = Math.max(1, r * 0.12)
  ctx.lineCap = 'round'
  const sx = x + r * 0.35, sy = y - r * 0.35, s = r * 0.32 * (0.6 + tw * 0.6)
  ctx.beginPath()
  ctx.moveTo(sx - s, sy)
  ctx.lineTo(sx + s, sy)
  ctx.moveTo(sx, sy - s)
  ctx.lineTo(sx, sy + s)
  ctx.stroke()
}

/** A single carried/dropped item glyph. */
const drawChunkGlyph = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, kind: ItemKind, now = 0): void => {
  if (kind === 'gold') {
    drawNugget(ctx, x, y, r, now)
    return
  }
  if (kind === 'goldPiece') {
    drawNugget(ctx, x, y, r * 0.66, now)
    return
  }
  const burnt = kind === 'burnt'
  ctx.fillStyle = burnt ? '#3d3630' : '#caa15e'
  ctx.beginPath()
  ctx.moveTo(x - r, y + r * 0.5)
  ctx.lineTo(x - r * 0.6, y - r * 0.75)
  ctx.lineTo(x + r * 0.35, y - r)
  ctx.lineTo(x + r, y + r * 0.15)
  ctx.lineTo(x + r * 0.3, y + r * 0.85)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = burnt ? '#1c1815' : '#7a5a2a'
  ctx.lineWidth = Math.max(1, r * 0.22)
  ctx.stroke()
  ctx.fillStyle = burnt ? '#191512' : '#4a2b16'
  circle(ctx, x - r * 0.25, y - r * 0.1, r * 0.2)
  ctx.fill()
  circle(ctx, x + r * 0.35, y + r * 0.3, r * 0.15)
  ctx.fill()
}

const drawPlate = (ctx: CanvasRenderingContext2D, now: number): void => {
  const x = goalX, y = floorY
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(x, y, unit * 2.2, unit * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#cdd6df'
  ctx.beginPath()
  ctx.ellipse(x, y - unit * 0.1, unit * 2.0, unit * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Level 1's Mini Cookie Dessert is a smaller node than the big multi-chunk ones.
  const r = unit * (game.dessertTotal <= 3 ? 1.2 : 1.7)
  drawDessert(ctx, x, y - unit * 1.5, r, game.dessertTotal, game.chunksInDessert)

  // Dessert stripped bare → the Gold Nugget it was hiding sits on the plate.
  if (game.goldExposed) drawNugget(ctx, x, y - unit * 0.7, unit * 0.6, now)
}

// ─── Ground items (dropped / blasted loose) ──────────────────────────────────
const drawGround = (ctx: CanvasRenderingContext2D, now: number): void => {
  // `despawnAt` is stamped on the engine's own gameplay clock (which pauses with
  // the game), so the flash countdown has to be measured against that same clock
  // — not `performance.now()`.
  const t = clock()
  for (const it of game.ground) {
    const x = xAt(it.pos)
    const y = floorY - unit * 0.28 - it.y * (goalX - homeX) * 0.5
    // Loose gold flashes rapidly over its final 4 seconds before it's lost (§F).
    const doomed = it.despawnAt !== Infinity && it.despawnAt - t < GOLD_FLASH_MS
    if (doomed && Math.sin(now / 55) < 0) continue
    drawChunkGlyph(ctx, x, y, unit * 0.32, it.kind, now)
  }
}

// ─── Cat-Eyes head + eye laser ────────────────────────────────────────────────
/** Screen x where the Mouse is actually drawn (clamped beside the dessert). */
const mouseScreenX = (): number => Math.min(xAt(game.renderPos), goalX - unit * 2.2)

const CAT_HEAD_UNITS = 2.9

/** The eye-laser. While charging, twin beams thicken and brighten onto the Mouse
 *  (`chargeT` 0→1) — and unlike Rev 4, this warm-up is NOT a window to freeze in.
 *  It is the window to RUN in: a motionless target is a guaranteed direct hit. */
const drawLaser = (ctx: CanvasRenderingContext2D, now: number): void => {
  const s = unit * CAT_HEAD_UNITS
  const eyeY = headY - s * 0.1

  // The fired beam: a hard, hot line onto the coordinate the Cat actually chose.
  if (game.laserFlash > 0 && game.laserAt >= 0) {
    const f = game.laserFlash
    const tx = xAt(game.laserAt)
    ctx.lineCap = 'round'
    for (const sgn of [-1, 1]) {
      const ex = headX + sgn * s * 0.36
      ctx.strokeStyle = `rgba(255,70,50,${0.75 * f})`
      ctx.lineWidth = unit * 0.9 * f
      ctx.beginPath()
      ctx.moveTo(ex, eyeY)
      ctx.lineTo(tx, floorY)
      ctx.stroke()
      ctx.strokeStyle = `rgba(255,245,230,${f})`
      ctx.lineWidth = unit * 0.34 * f
      ctx.beginPath()
      ctx.moveTo(ex, eyeY)
      ctx.lineTo(tx, floorY)
      ctx.stroke()
    }
    ctx.fillStyle = `rgba(255,150,110,${f * 0.9})`
    circle(ctx, tx, floorY, unit * (0.6 + 1.6 * (1 - f)))
    ctx.fill()
  }

  if (!game.charging) return
  const t = game.chargeT
  const tx = mouseScreenX()
  const ty = floorY - unit * 0.7
  const flicker = 0.7 + 0.3 * Math.sin(now / 30)
  ctx.lineCap = 'round'
  for (const sgn of [-1, 1]) {
    const ex = headX + sgn * s * 0.36
    ctx.strokeStyle = `rgba(255,60,46,${(0.22 + 0.5 * t) * flicker})`
    ctx.lineWidth = unit * (0.08 + 0.5 * t)
    ctx.beginPath()
    ctx.moveTo(ex, eyeY)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    if (t > 0.55) {
      ctx.strokeStyle = `rgba(255,235,210,${(t - 0.5) * 1.4})`
      ctx.lineWidth = unit * (0.04 + 0.22 * t)
      ctx.beginPath()
      ctx.moveTo(ex, eyeY)
      ctx.lineTo(tx, ty)
      ctx.stroke()
    }
    const g = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, s * (0.18 + 0.3 * t))
    g.addColorStop(0, `rgba(255,210,190,${0.5 + 0.5 * t})`)
    g.addColorStop(1, 'rgba(255,40,30,0)')
    ctx.fillStyle = g
    circle(ctx, ex, eyeY, s * (0.18 + 0.3 * t))
    ctx.fill()
  }
}

/** Cat-Eyes: a mechanical cat head styled after a Felix-the-Cat wall clock.
 *  Rev 5 leaves it exactly two states — asleep (green light) and awake (red) —
 *  with a shake as the wake-up telegraph and a quiver while enraged. */
const drawCatHead = (ctx: CanvasRenderingContext2D, now: number): void => {
  const s = unit * CAT_HEAD_UNITS
  const awake = game.catState === 'awake'
  const breathe = awake ? 0 : Math.sin(now / 700) * s * 0.03
  // Telegraphy: he shakes right before waking, and trembles nonstop when enraged.
  const shake = game.catShaking ? Math.sin(now / 26) * s * 0.07 : 0
  const quiver = game.enraged ? Math.sin(now / 34) * s * 0.035 : 0
  const cx = headX + shake + quiver
  const y = headY + breathe + (game.enraged ? Math.cos(now / 41) * s * 0.02 : 0)

  ctx.save()
  ctx.translate(cx, y)

  // head
  ctx.fillStyle = '#3f4552'
  circle(ctx, 0, 0, s)
  ctx.fill()
  // ears
  const earFlick = game.catShaking ? Math.sin(now / 60) * 0.3 : 0
  for (const sgn of [-1, 1]) {
    ctx.save()
    ctx.translate(sgn * s * 0.7, -s * 0.7)
    ctx.rotate(sgn * (0.2 + earFlick))
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(s * 0.45 * sgn, -s * 0.6)
    ctx.lineTo(s * 0.6 * sgn, 0)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  // cheeks / muzzle
  ctx.fillStyle = '#4a505e'
  ctx.beginPath()
  ctx.ellipse(0, s * 0.35, s * 0.7, s * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()

  // eyes — closed & snoring, or wide open and red
  const eyeY = -s * 0.1
  if (!awake) {
    ctx.strokeStyle = '#11131a'
    ctx.lineWidth = s * 0.07
    ctx.lineCap = 'round'
    for (const sgn of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(sgn * s * 0.36, eyeY, s * 0.2, 0.3, Math.PI - 0.3)
      ctx.stroke()
    }
  } else {
    // The pupils track the Mouse the whole time the eyes are open.
    const px = (game.catGazeX - 0.5) * s * 0.3
    for (const sgn of [-1, 1]) {
      const ex = sgn * s * 0.36
      ctx.fillStyle = '#f3e9b0'
      ctx.beginPath()
      ctx.ellipse(ex, eyeY, s * 0.26, s * 0.26, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ff3b3b'
      circle(ctx, ex + px, eyeY + s * 0.05, s * 0.15)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,80,70,0.45)'
      circle(ctx, ex + px, eyeY + s * 0.05, s * 0.32)
      ctx.fill()
    }
  }
  // nose
  ctx.fillStyle = '#e87a90'
  ctx.beginPath()
  ctx.moveTo(-s * 0.1, s * 0.2)
  ctx.lineTo(s * 0.1, s * 0.2)
  ctx.lineTo(0, s * 0.34)
  ctx.closePath()
  ctx.fill()
  // the wide cat grin, only while it's hunting
  if (awake) {
    ctx.strokeStyle = '#11131a'
    ctx.lineWidth = s * 0.06
    ctx.beginPath()
    ctx.arc(0, s * 0.3, s * 0.4, 0.15, Math.PI - 0.15)
    ctx.stroke()
  }
  // Zzz while asleep (and the music is playing)
  if (!awake) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.textAlign = 'left'
    const zb = Math.sin(now / 500) * s * 0.08
    ctx.font = `900 ${Math.round(s * 0.4)}px Angry, sans-serif`
    ctx.fillText('z', s * 0.9, -s * 0.8 + zb)
    ctx.font = `900 ${Math.round(s * 0.6)}px Angry, sans-serif`
    ctx.fillText('Z', s * 1.2, -s * 1.15 - zb)
  }
  ctx.restore()

  // The green / red light itself — the single clearest read of the Cat's state.
  const lightY = headY - s * 1.45
  const on = awake ? '#ff3b3b' : '#5cd16d'
  const glow = ctx.createRadialGradient(headX, lightY, 0, headX, lightY, s * 0.7)
  glow.addColorStop(0, awake ? 'rgba(255,60,50,0.75)' : 'rgba(90,220,110,0.6)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  circle(ctx, headX, lightY, s * 0.7)
  ctx.fill()
  ctx.fillStyle = on
  circle(ctx, headX, lightY, s * 0.16)
  ctx.fill()
}

// ─── Mouse ───────────────────────────────────────────────────────────────────
const drawMouse = (
  ctx: CanvasRenderingContext2D, x: number, y: number, s: number, facing: 1 | -1,
  now: number, playDead: boolean, round = false
): void => {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(facing, 1)
  const walking = game.moving
  const bob = walking ? Math.abs(Math.sin(now / (game.dashing ? 50 : 95))) * s * 0.12 : Math.sin(now / 700) * s * 0.03
  ctx.translate(0, -bob)
  // Release every control and the Mouse instantly flips belly-up and plays dead.
  if (playDead) ctx.scale(1, -1)
  // Devoured the whole dessert in the Frenzy → cartoonishly round.
  if (round) ctx.scale(1.5, 1.5)

  // tail
  ctx.strokeStyle = mouseFur2; ctx.lineWidth = s * 0.12; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.2)
  ctx.quadraticCurveTo(-s * 1.3, s * 0.1 + Math.sin(now / 200) * s * 0.2, -s * 1.1, -s * 0.4)
  ctx.stroke()

  // Whatever he's hauling rides on his back — the sack grows with the weight.
  if (game.items.length && !round) {
    const hasGold = game.items.includes('gold')
    const sackR = s * (0.3 + game.slots * 0.1)
    ctx.fillStyle = hasGold ? '#ffcd2e' : '#caa15e'
    circle(ctx, -s * 0.5, -s * 0.4, sackR)
    ctx.fill()
    ctx.strokeStyle = hasGold ? '#8a5d08' : '#7a5a2a'
    ctx.lineWidth = s * 0.06
    ctx.stroke()
    ctx.fillStyle = hasGold ? '#fff0a8' : '#4a2b16'
    circle(ctx, -s * 0.62, -s * 0.46, sackR * 0.2)
    ctx.fill()
  }

  // body
  ctx.fillStyle = mouseFur
  const bw = round ? 1.15 : 1.4
  const bh = round ? 1.25 : 0.95
  rr(ctx, -s * bw * 0.5, -s * (bh * 0.5), s * bw, s * bh, s * 0.45)
  ctx.fill()
  // head
  const hx = s * 0.55
  ctx.fillStyle = mouseFur
  circle(ctx, hx, -s * 0.1, s * 0.42); ctx.fill()
  // ears
  ctx.fillStyle = mouseFur2
  circle(ctx, hx - s * 0.1, -s * 0.5, s * 0.26); ctx.fill()
  circle(ctx, hx + s * 0.28, -s * 0.45, s * 0.22); ctx.fill()
  ctx.fillStyle = '#e8b6c2'
  circle(ctx, hx - s * 0.1, -s * 0.5, s * 0.13); ctx.fill()
  // eye — X'd out while playing dead
  if (playDead) {
    ctx.strokeStyle = '#11131a'; ctx.lineWidth = s * 0.07
    ctx.beginPath()
    ctx.moveTo(hx + s * 0.1, -s * 0.2)
    ctx.lineTo(hx + s * 0.3, 0)
    ctx.moveTo(hx + s * 0.3, -s * 0.2)
    ctx.lineTo(hx + s * 0.1, 0)
    ctx.stroke()
  } else {
    ctx.fillStyle = '#11131a'
    circle(ctx, hx + s * 0.2, -s * 0.12, s * 0.08)
    ctx.fill()
  }
  // nose + whiskers
  ctx.fillStyle = '#e87a90'; circle(ctx, hx + s * 0.42, -s * 0.02, s * 0.07); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1
  for (const dy of [-0.06, 0.02, 0.1]) {
    ctx.beginPath()
    ctx.moveTo(hx + s * 0.42, -s * 0.02 + s * dy)
    ctx.lineTo(hx + s * 0.9, -s * 0.06 + s * dy * 1.6)
    ctx.stroke()
  }
  // feet
  ctx.fillStyle = mouseFur2
  const fp = walking ? Math.sin(now / (game.dashing ? 50 : 95)) * s * 0.2 : 0
  circle(ctx, -s * 0.2 + fp, s * 0.5, s * 0.12); ctx.fill()
  circle(ctx, s * 0.2 - fp, s * 0.5, s * 0.12); ctx.fill()
  ctx.restore()
}

/** Dash tell: speed lines streaking off the Mouse's back. */
const drawDashTrail = (ctx: CanvasRenderingContext2D, x: number, now: number): void => {
  if (!game.dashing || !game.moving) return
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    const off = ((now / 3 + i * 40) % 90) / 90
    const len = unit * (0.5 + off * 0.9)
    const y = floorY - unit * (0.35 + i * 0.45)
    ctx.lineWidth = unit * 0.07 * (1 - off)
    ctx.globalAlpha = (1 - off) * 0.7
    ctx.beginPath()
    ctx.moveTo(x - game.facing * unit * 0.7, y)
    ctx.lineTo(x - game.facing * (unit * 0.7 + len), y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// ─── Player Carry UI + Dessert Node UI (the mockup) ──────────────────────────
/** The little dark chip both proximity HUDs are drawn in. */
const drawChip = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string, alpha: number, accent = '#ffe9a8'): void => {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `900 ${Math.round(unit * 0.52)}px Angry, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = Math.max(unit * 1.5, ctx.measureText(text).width + unit * 0.6)
  const h = unit * 0.82
  ctx.fillStyle = 'rgba(10,20,14,0.82)'
  rr(ctx, x - w / 2, y - h / 2, w, h, unit * 0.18)
  ctx.fill()
  ctx.strokeStyle = accent
  ctx.lineWidth = Math.max(1.5, unit * 0.07)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x, y + unit * 0.02)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

/** §D: the green harvest ring — a 1.5s countdown that runs while the direction
 *  into the dessert is held, and vanishes the moment the player walks away. */
const drawHarvestRing = (ctx: CanvasRenderingContext2D, x: number, y: number, t: number, alpha: number): void => {
  const r = unit * 0.5
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = unit * 0.2
  circle(ctx, x, y, r)
  ctx.stroke()
  ctx.strokeStyle = '#5cd16d'
  ctx.lineWidth = unit * 0.16
  ctx.beginPath()
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, t))
  ctx.stroke()
  ctx.restore()
}

/** Both proximity HUDs. They live and die with the Mouse's distance to the
 *  dessert (`nearDessert`), exactly as the mockup annotates. */
let uiFade = 0
const drawProximityUi = (ctx: CanvasRenderingContext2D, mx: number, dt: number): void => {
  // The carry chip also appears at the door, where it drains to 0 as the haul
  // transfers into the Mouse Hole (§E "the carry UI node appears at the door").
  const want = (game.nearDessert || (game.atDoor && game.items.length > 0)) && phase.value === 'playing'
  const target = want ? 1 : 0
  uiFade += (target - uiFade) * Math.min(1, (dt / 1000) * 10)
  if (uiFade < 0.02) return

  // Player Carry UI — current inventory capacity, e.g. 0/3.
  drawChip(ctx, mx, floorY - unit * 2.5, `${fmt(game.slots)}/${MAX_SLOTS}`, uiFade)

  if (!game.nearDessert) return

  // Dessert Node UI — chunks left in the node, e.g. 6/6 — with the green
  // progress ring sitting just to its left while a harvest is running. Once the
  // node is stripped there is no dessert left to annotate (it has poofed), so
  // the chip goes with it rather than hanging over an empty plate reading 0/6.
  const dx = goalX
  const dy = floorY - unit * (game.dessertTotal <= 3 ? 3.0 : 3.6)
  if (game.chunksInDessert > 0) {
    drawChip(ctx, dx + unit * 0.55, dy, `${game.chunksInDessert}/${game.dessertTotal}`, uiFade)
  }
  if (game.harvestT > 0) drawHarvestRing(ctx, dx - unit * 1.1, dy, game.harvestT, uiFade)
}

// ─── Door HUD: the deposit drain + the Safe Exit hold ─────────────────────────
const drawDoorUi = (ctx: CanvasRenderingContext2D, now: number): void => {
  if (phase.value !== 'playing') return
  // §G Safe Exit: the dessert is stripped and gold is still on the table — hold
  // away from it to bank the level and go home.
  if (game.canExit) {
    const y = floorY - unit * 2.6
    drawHarvestRing(ctx, homeX, y, Math.max(0.001, game.exitT), 1)
    if (game.exitT <= 0) {
      ctx.save()
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 260)
      ctx.fillStyle = '#ffe9a8'
      ctx.font = `900 ${Math.round(unit * 0.6)}px Angry, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('←', homeX, y + unit * 0.22)
      ctx.restore()
    }
  }
}

// ─── Danger vignette + the Gold Nugget's red frenzy ──────────────────────────
const drawDangerVignette = (ctx: CanvasRenderingContext2D, now: number): void => {
  // §G: taking the nugget fades the whole screen red for the rest of the level.
  if (game.enraged) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 420)
    ctx.fillStyle = `rgba(150,10,10,${0.1 + 0.07 * pulse})`
    ctx.fillRect(0, 0, W, H)
  }
  const danger = game.catState === 'awake' || game.charging
  if (!danger) return
  const k = game.charging ? 1 : 0.65
  const pulse = game.charging ? (Math.sin(now / 100) * 0.5 + 0.5) : 1
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(200,30,30,${0.06 + k * 0.3 * pulse})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

// ─── Eating Frenzy (§I) ──────────────────────────────────────────────────────
/** The five "zip" coordinates the Mouse teleports between, in numerical order,
 *  resetting at 1 — taken straight from the Design Footnotes sketch. */
const ZIP_ANGLES = [0.62, Math.PI, -Math.PI / 2, Math.PI * 0.78, 0]

const drawChokeMeter = (ctx: CanvasRenderingContext2D, pct: number, now: number): void => {
  const w = Math.min(W * 0.62, unit * 14)
  const h = unit * 0.66
  const x = (W - w) / 2
  const y = H * 0.76
  // A mouse book-ends each side of the bar, per the UI-layout sketch.
  drawMouse(ctx, x - unit * 1.3, y + h / 2, unit * 0.42, 1, now, false)
  drawMouse(ctx, x + w + unit * 1.3, y + h / 2, unit * 0.42, -1, now, false)

  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  rr(ctx, x, y, w, h, h / 2)
  ctx.fill()
  const hot = pct > 75
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, '#5cd16d')
  g.addColorStop(0.6, '#ffcd00')
  g.addColorStop(1, '#ff2d2d')
  ctx.save()
  rr(ctx, x, y, w, h, h / 2)
  ctx.clip()
  ctx.fillStyle = g
  ctx.fillRect(x, y, (w * Math.max(0, Math.min(100, pct))) / 100, h)
  ctx.restore()
  ctx.strokeStyle = hot && Math.sin(now / 70) > 0 ? '#ffffff' : '#ffe9a8'
  ctx.lineWidth = Math.max(2, unit * 0.09)
  rr(ctx, x, y, w, h, h / 2)
  ctx.stroke()
}

const drawFrenzy = (ctx: CanvasRenderingContext2D, now: number, timeLeftS: number, chokeShown: number): void => {
  ctx.fillStyle = 'rgba(8,18,12,0.86)'
  ctx.fillRect(0, 0, W, H)

  // TIME, big, at the top (per the UI-layout sketch) — clear of the DOM title
  // above it and of the top of the Mouse's zip orbit below it.
  ctx.fillStyle = timeLeftS <= 5 ? '#ff6b6b' : '#ffffff'
  ctx.font = `900 ${Math.round(unit * 2.2)}px Angry, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(String(Math.ceil(timeLeftS)), W / 2, H * 0.24)

  const cx = W / 2
  const cy = H * 0.52
  const r = Math.min(W, H) * 0.17
  // The dessert visibly degrades every 5 presses, one bite per step.
  drawDessert(ctx, cx, cy, r, FRENZY_STAGES, Math.max(0, FRENZY_STAGES - game.frenzyStage))

  // The Mouse zips to a new bite coordinate on every mash.
  const a = ZIP_ANGLES[game.frenzyZip % FRENZY_ZIPS] ?? 0
  const mr = r * 1.35
  const mx = cx + Math.cos(a) * mr
  const my = cy + Math.sin(a) * mr
  if (game.round) {
    drawMouse(ctx, cx, cy, unit * 1.1, 1, now, false, true)
  } else if (game.choking) {
    // Coughing fit: he's doubled over and paralyzed for 2.5s.
    drawMouse(ctx, mx, my, unit * 0.8, Math.cos(a) > 0 ? -1 : 1, now, false)
    ctx.fillStyle = '#8fd6ff'
    ctx.font = `900 ${Math.round(unit * 0.9)}px Angry, sans-serif`
    ctx.fillText('!', mx, my - unit * 1.3)
  } else {
    drawMouse(ctx, mx, my, unit * 0.8, Math.cos(a) > 0 ? -1 : 1, now, false)
  }

  drawChokeMeter(ctx, chokeShown, now)
}

// ─── Master draw ─────────────────────────────────────────────────────────────
let lastNow = 0
export const drawScene = (
  ctx: CanvasRenderingContext2D, w: number, h: number, now: number,
  hud: { pass: number; perfect: number; timeLeft: number; choke: number }
): void => {
  if (w !== W || h !== H) configureGeometry(w, h)
  const dt = lastNow ? Math.min(now - lastNow, 50) : 16
  lastNow = now

  drawBackground(ctx)

  if (phase.value === 'frenzy') {
    drawFrenzy(ctx, now, hud.timeLeft, hud.choke)
    drainFx()
    updateParticles(ctx, dt)
    return
  }

  drawClearSign(ctx, hud.pass, hud.perfect)
  drawDoor(ctx)
  drawPlate(ctx, now)
  drawGround(ctx, now)

  const mx = mouseScreenX()
  // A direct hit vaporizes him — there's no Mouse left to draw, just the ash.
  const vaporized = phase.value === 'dead' && game.laserFlash > 0
  if (!vaporized) {
    drawDashTrail(ctx, mx, now)
    drawMouse(ctx, mx, floorY - unit * 0.55, unit * 0.9, game.facing,
      now, game.playingDead && phase.value === 'playing')
  }

  // Sweat beads fly off the Mouse while he's hauling a heavy load.
  if (game.slots > 0 && game.moving && Math.random() < dt / 120) {
    particles.push({
      x: mx + (Math.random() - 0.5) * unit * 0.6, y: floorY - unit * 1.4,
      vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 30,
      life: 0, max: 520, size: unit * 0.1, color: '#bfe6ff', kind: 'sweat'
    })
  }

  drawCatHead(ctx, now)
  drawLaser(ctx, now)
  drawProximityUi(ctx, mx, dt)
  drawDoorUi(ctx, now)

  drainFx()
  updateParticles(ctx, dt)
  drawDangerVignette(ctx, now)
}
