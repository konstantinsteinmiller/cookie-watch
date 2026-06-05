/**
 * Cookie Watch — canvas renderer + VFX.
 *
 * Pure view layer: reads the engine's per-frame render model (`game`) and the
 * phase, owns NO game logic. Everything is drawn as crisp programmatic vectors
 * (mouse, cat, cookie, hole, zones, traps) so the game is fully playable before
 * any art lands; each sprite has an image-override hook that swaps to a file in
 * `/public/images/...` the moment one exists (see `imageFor`). DPR scaling is
 * applied by the scene; we draw in CSS pixels.
 */
import { game, phase, type Dir, type CatState, type FxEvent } from '@/use/useCookieGame'
import { prependBaseUrl } from '@/utils/function'

// ─── Layout / geometry ───────────────────────────────────────────────────────
let W = 0
let H = 0
let portrait = true
interface Pt { x: number; y: number }
let pathPts: Pt[] = []   // [0..seg] hole→cookie
let unit = 24            // base sizing unit ~ min(W,H)/N

/** Recompute the path layout for the current viewport + stage segment count. */
export const configureGeometry = (w: number, h: number): boolean => {
  if (w <= 0 || h <= 0) return false
  W = w; H = h
  portrait = h >= w
  unit = Math.max(14, Math.min(w, h) / 18)
  buildPath()
  return true
}

const buildPath = (): void => {
  const seg = Math.max(1, game.seg)
  pathPts = []
  if (portrait) {
    const holeY = H * 0.86
    const topY = H * 0.20
    const amp = Math.min(W * 0.16, 90)
    for (let i = 0; i <= seg; i++) {
      const t = i / seg
      const y = holeY + (topY - holeY) * t
      // gentle serpentine for interior nodes; hole + cookie stay centred
      const wob = (i === 0 || i === seg) ? 0 : Math.sin(t * Math.PI * 1.5) * amp * (i % 2 === 0 ? -1 : 1)
      pathPts.push({ x: W * 0.5 + wob, y })
    }
  } else {
    const holeX = W * 0.12
    const cookieX = W * 0.85
    const amp = Math.min(H * 0.16, 80)
    for (let i = 0; i <= seg; i++) {
      const t = i / seg
      const x = holeX + (cookieX - holeX) * t
      const wob = (i === 0 || i === seg) ? 0 : Math.sin(t * Math.PI * 1.5) * amp * (i % 2 === 0 ? -1 : 1)
      pathPts.push({ x, y: H * 0.56 + wob })
    }
  }
}

/** Screen point for a continuous path position p∈[0..seg]. */
const pointAt = (p: number): Pt => {
  if (pathPts.length === 0) return { x: W / 2, y: H / 2 }
  const seg = pathPts.length - 1
  const cp = Math.max(0, Math.min(seg, p))
  const i = Math.floor(cp)
  const f = cp - i
  const a = pathPts[i]!
  const b = pathPts[Math.min(seg, i + 1)]!
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

// ─── Image-override registry (vector fallback until art lands) ────────────────
const imgCache = new Map<string, HTMLImageElement | null>()
const imageFor = (name: string): HTMLImageElement | null => {
  if (imgCache.has(name)) return imgCache.get(name) ?? null
  imgCache.set(name, null) // pending → vector this frame
  const img = new Image()
  img.onload = () => imgCache.set(name, img)
  img.onerror = () => imgCache.set(name, null)
  img.src = prependBaseUrl(`images/props/${name}`)
  return null
}
/** Warm a set of optional sprite overrides after first paint (no-op if absent). */
export const warmImages = async (srcs: ReadonlyArray<string>): Promise<void> => {
  for (const s of srcs) imageFor(s)
}
export const warmTileImages = async (): Promise<void> => {
  await warmImages(['cookie.webp', 'mouse.webp', 'cat.webp', 'mouse-hole.webp', 'mousetrap.webp'])
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
  kind: 'spark' | 'ring' | 'crumb' | 'slash' | 'puff' | 'text'
  rot?: number; vr?: number; text?: string
}
let particles: Particle[] = []
const MAX_PARTICLES = 220

const spawnFx = (e: FxEvent): void => {
  const at = pointAt(e.at)
  const cat = pointAt(game.seg)
  switch (e.kind) {
    case 'noise': {
      // expanding alert ring at the cat + a few jitter sparks
      particles.push({ x: cat.x, y: cat.y - unit * 1.4, vx: 0, vy: 0, life: 0, max: 520, size: unit * (0.8 + e.power), color: '#ffd23c', kind: 'ring' })
      break
    }
    case 'step': {
      for (let i = 0; i < 3; i++) particles.push({ x: at.x, y: at.y + unit * 0.5, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0, max: 360, size: unit * 0.12, color: '#d9c7a0', kind: 'puff' })
      break
    }
    case 'crumb': case 'grab': {
      for (let i = 0; i < 6; i++) particles.push({ x: cat.x, y: cat.y, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, life: 0, max: 620, size: unit * (0.12 + Math.random() * 0.14), color: ['#c98a3c', '#a86a28', '#e0b070'][i % 3]!, kind: 'crumb', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 })
      break
    }
    case 'deposit': {
      const hole = pointAt(0)
      for (let i = 0; i < Math.round(10 + e.power * 14); i++) {
        const a = Math.random() * Math.PI * 2
        particles.push({ x: hole.x, y: hole.y, vx: Math.cos(a) * (60 + Math.random() * 160), vy: -Math.abs(Math.sin(a)) * (120 + Math.random() * 140), life: 0, max: 700, size: unit * 0.16, color: '#ffd23c', kind: 'spark' })
      }
      particles.push({ x: hole.x, y: hole.y - unit * 1.6, vx: 0, vy: -28, life: 0, max: 900, size: unit, color: '#fff3b0', kind: 'text', text: '+100' })
      break
    }
    case 'pounce': {
      particles.push({ x: at.x, y: at.y, vx: 0, vy: 0, life: 0, max: 380, size: unit * 2.6, color: '#ff5a4d', kind: 'slash' })
      break
    }
    case 'escape': {
      for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2; particles.push({ x: at.x, y: at.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, life: 0, max: 600, size: unit * 0.2, color: '#9be8a8', kind: 'spark' }) }
      break
    }
    case 'trap': {
      particles.push({ x: at.x, y: at.y, vx: 0, vy: 0, life: 0, max: 320, size: unit * 1.6, color: '#ffffff', kind: 'slash' })
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
      ctx.globalAlpha = (1 - k) * 0.7
      ctx.strokeStyle = p.color
      ctx.lineWidth = unit * 0.18 * (1 - k)
      circle(ctx, p.x, p.y, p.size * (0.4 + k * 1.4)); ctx.stroke()
    } else if (p.kind === 'slash') {
      ctx.globalAlpha = (1 - k)
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
      p.vy += (560 * dt) / 1000 // gravity
      p.x += (p.vx * dt) / 1000
      p.y += (p.vy * dt) / 1000
      if (p.rot != null) p.rot += ((p.vr || 0) * dt) / 1000
      ctx.globalAlpha = 1 - k
      ctx.fillStyle = p.color
      if (p.kind === 'crumb') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0); rr(ctx, -p.size, -p.size * 0.7, p.size * 2, p.size * 1.4, p.size * 0.4); ctx.fill(); ctx.restore() }
      else { circle(ctx, p.x, p.y, p.size); ctx.fill() }
    }
    next.push(p)
  }
  particles = next
  ctx.globalAlpha = 1
}

// ─── Scene background (kitchen counter, night) ───────────────────────────────
const drawBackground = (ctx: CanvasRenderingContext2D, now: number): void => {
  // Counter top: warm wood gradient.
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#15321f')
  g.addColorStop(0.5, '#1c3a26')
  g.addColorStop(1, '#102a1a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Soft moonlight pool behind the cookie.
  const ck = pointAt(game.seg)
  const moon = ctx.createRadialGradient(ck.x, ck.y, 0, ck.x, ck.y, Math.max(W, H) * 0.5)
  moon.addColorStop(0, 'rgba(120,180,140,0.18)')
  moon.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = moon
  ctx.fillRect(0, 0, W, H)

  // Faint plank seams.
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'
  ctx.lineWidth = 1
  const step = Math.max(60, unit * 3)
  for (let y = step; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
  void now
}

const drawPath = (ctx: CanvasRenderingContext2D): void => {
  if (pathPts.length < 2) return
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = unit * 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(pathPts[0]!.x, pathPts[0]!.y)
  for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i]!.x, pathPts[i]!.y)
  ctx.stroke()
  // dashed centre guide
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 2
  ctx.setLineDash([unit * 0.4, unit * 0.5])
  ctx.stroke()
  ctx.setLineDash([])
}

// ─── Zone markers + prompt cue ───────────────────────────────────────────────
const dirAngle: Record<Dir, number> = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }
const drawArrow = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dir: Dir, color: string): void => {
  ctx.save(); ctx.translate(x, y); ctx.rotate(dirAngle[dir])
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(r, 0); ctx.lineTo(-r * 0.55, -r * 0.7); ctx.lineTo(-r * 0.2, 0); ctx.lineTo(-r * 0.55, r * 0.7)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

const drawZones = (ctx: CanvasRenderingContext2D, now: number): void => {
  const seg = game.seg
  for (let i = 1; i < seg; i++) {
    const pt = pathPts[i]!
    const isHide = game.hideZones.has(i)
    const isTrap = game.trapZones.has(i)
    // marker disc
    ctx.fillStyle = isTrap ? 'rgba(90,30,30,0.5)' : isHide ? 'rgba(40,60,90,0.5)' : 'rgba(0,0,0,0.28)'
    circle(ctx, pt.x, pt.y, unit * 0.85); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke()
    if (isHide) drawDrawerLeg(ctx, pt.x, pt.y)
    if (isTrap) drawTrap(ctx, pt.x, pt.y, now)
  }
  // Current prompt cue at the NEXT target zone.
  if (phase.value === 'playing') {
    const target = game.pos + (game.outbound ? 1 : -1)
    if (target >= 0 && target <= seg) {
      const tp = pointAt(target)
      const pend = game.pending
      if (pend.kind === 'move' || pend.kind === 'trap') {
        const dir = pend.kind === 'trap' ? pend.trapDir : pend.seq[pend.pip]
        const pulse = 1 + Math.sin(now / 140) * 0.08
        const col = pend.kind === 'trap' ? '#ff5a4d' : '#ffd23c'
        ctx.save(); ctx.globalAlpha = 0.95
        rr(ctx, tp.x - unit * 1.0 * pulse, tp.y - unit * 2.4, unit * 2.0 * pulse, unit * 1.5, unit * 0.4)
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill()
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke()
        if (dir) drawArrow(ctx, tp.x, tp.y - unit * 1.65, unit * 0.5, dir, col)
        ctx.restore()
        // pip row for multi-tap zones
        if (pend.kind === 'move' && pend.seq.length > 1) {
          const n = pend.seq.length
          const pw = unit * 0.3
          for (let k = 0; k < n; k++) {
            circle(ctx, tp.x - ((n - 1) * pw) + k * pw * 2, tp.y - unit * 0.5, pw * 0.5)
            ctx.fillStyle = k < pend.pip ? '#ffd23c' : 'rgba(255,255,255,0.3)'; ctx.fill()
          }
        }
      }
    }
  }
}

const drawDrawerLeg = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  ctx.fillStyle = '#5a3c24'
  rr(ctx, x - unit * 0.35, y - unit * 1.8, unit * 0.7, unit * 1.6, unit * 0.2); ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  rr(ctx, x - unit * 0.12, y - unit * 1.7, unit * 0.24, unit * 1.4, unit * 0.1); ctx.fill()
}

const drawTrap = (ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void => {
  ctx.fillStyle = '#7a5230'
  rr(ctx, x - unit * 0.6, y + unit * 0.1, unit * 1.2, unit * 0.5, unit * 0.12); ctx.fill()
  // snapping bar (animated)
  const open = (Math.sin(now / 260) + 1) / 2
  ctx.save(); ctx.translate(x - unit * 0.4, y + unit * 0.2); ctx.rotate(-open * 1.4)
  ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = unit * 0.16; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(unit * 0.9, 0); ctx.stroke()
  ctx.restore()
}

// ─── Mouse hole ──────────────────────────────────────────────────────────────
const drawHole = (ctx: CanvasRenderingContext2D): void => {
  const p = pathPts[0]!
  // skirting board panel
  ctx.fillStyle = '#23303f'
  rr(ctx, p.x - unit * 2.2, p.y - unit * 1.2, unit * 4.4, unit * 2.6, unit * 0.3); ctx.fill()
  // arched hole
  ctx.fillStyle = '#05080c'
  ctx.beginPath()
  ctx.moveTo(p.x - unit * 1.1, p.y + unit * 1.1)
  ctx.lineTo(p.x - unit * 1.1, p.y)
  ctx.arc(p.x, p.y, unit * 1.1, Math.PI, 0)
  ctx.lineTo(p.x + unit * 1.1, p.y + unit * 1.1)
  ctx.closePath(); ctx.fill()
  // inner glow
  const g = ctx.createRadialGradient(p.x, p.y + unit * 0.4, 0, p.x, p.y + unit * 0.4, unit * 1.2)
  g.addColorStop(0, 'rgba(255,200,90,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fill()
}

// ─── Cookie + Cat ────────────────────────────────────────────────────────────
const drawCookie = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
  const frac = Math.max(0.12, game.chunksInCookie / Math.max(1, game.cookieTotal))
  const rr2 = r * (0.55 + 0.45 * frac)
  // body
  const g = ctx.createRadialGradient(x - rr2 * 0.3, y - rr2 * 0.3, rr2 * 0.2, x, y, rr2)
  g.addColorStop(0, '#e3b873'); g.addColorStop(1, '#b07c3a')
  ctx.fillStyle = g
  // bitten edge: draw a wedge removed proportional to depletion
  const eaten = (1 - frac) * Math.PI * 1.2
  ctx.beginPath()
  ctx.arc(x, y, rr2, eaten, Math.PI * 2, false)
  if (eaten > 0.01) ctx.lineTo(x, y)
  ctx.closePath(); ctx.fill()
  // chocolate chips
  ctx.fillStyle = '#4a2b16'
  const chips = 9
  for (let i = 0; i < chips; i++) {
    const a = (i / chips) * Math.PI * 2 + 0.6
    if (a > eaten && a < Math.PI * 2) {
      const cr = rr2 * (0.3 + (i % 3) * 0.2)
      circle(ctx, x + Math.cos(a) * cr, y + Math.sin(a) * cr, rr2 * 0.1); ctx.fill()
    }
  }
  ctx.strokeStyle = '#8a5d28'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rr2, eaten, Math.PI * 2); ctx.stroke()
}

const drawCat = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, state: CatState, now: number): void => {
  const breathe = Math.sin(now / 600) * s * 0.04
  // body
  ctx.fillStyle = '#3a3f4a'
  rr(ctx, x - s * 1.3, y - s * 0.6 + breathe, s * 2.6, s * 1.3, s * 0.6); ctx.fill()
  // head
  const hx = x + s * 0.9
  const hy = y - s * 0.5 + breathe
  ctx.fillStyle = '#454b58'
  circle(ctx, hx, hy, s * 0.7); ctx.fill()
  // ears
  const earFlick = state === 'stirring' ? Math.sin(now / 120) * 0.3 : 0
  ctx.fillStyle = '#454b58'
  for (const sgn of [-1, 1]) {
    ctx.save(); ctx.translate(hx + sgn * s * 0.4, hy - s * 0.55); ctx.rotate(sgn * (0.2 + earFlick))
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.3 * sgn, -s * 0.5); ctx.lineTo(s * 0.5 * sgn, 0); ctx.closePath(); ctx.fill(); ctx.restore()
  }
  // eyes
  const eyeY = hy - s * 0.05
  if (state === 'asleep') {
    ctx.strokeStyle = '#11131a'; ctx.lineWidth = s * 0.08; ctx.lineCap = 'round'
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + sgn * s * 0.28, eyeY, s * 0.16, 0.3, Math.PI - 0.3); ctx.stroke() }
  } else {
    const open = state === 'stirring' ? 0.4 : 1
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = '#f3e9b0'; circle(ctx, hx + sgn * s * 0.28, eyeY, s * 0.18 * open + s * 0.02); ctx.fill()
      ctx.fillStyle = (state === 'alert' || state === 'pounce') ? '#ff4d4d' : '#1a1a1a'
      circle(ctx, hx + sgn * s * 0.28 + (state === 'pounce' ? s * 0.05 : 0), eyeY, s * 0.09 * open + s * 0.02); ctx.fill()
    }
  }
  // nose
  ctx.fillStyle = '#e87a90'; circle(ctx, hx + s * 0.62, hy + s * 0.1, s * 0.08); ctx.fill()

  // Zzz bubble while fully asleep (and not fake-sleeping a tell).
  if (state === 'asleep') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `900 ${Math.round(s * 0.5)}px Angry, sans-serif`; ctx.textAlign = 'left'
    const zb = Math.sin(now / 500) * s * 0.1
    ctx.fillText('z', hx + s * 0.6, hy - s * 0.7 + zb)
    ctx.font = `900 ${Math.round(s * 0.7)}px Angry, sans-serif`
    ctx.fillText('Z', hx + s * 0.95, hy - s * 1.05 - zb)
  }
  // Pounce tell: a crouch shadow + twitching tail
  if (state === 'pounce') {
    ctx.strokeStyle = 'rgba(255,80,70,0.6)'; ctx.lineWidth = 3
    circle(ctx, hx, hy, s * (0.9 + Math.sin(now / 90) * 0.1)); ctx.stroke()
  }
}

// ─── Mouse (vectorized) ──────────────────────────────────────────────────────
const drawMouse = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, facing: 1 | -1, carried: number, now: number, caught: boolean): void => {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(facing, 1)
  const bob = game.moving ? Math.abs(Math.sin(now / 90)) * s * 0.12 : Math.sin(now / 700) * s * 0.03
  ctx.translate(0, -bob)
  // tail
  ctx.strokeStyle = mouseFur2; ctx.lineWidth = s * 0.12; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.2)
  ctx.quadraticCurveTo(-s * 1.3, s * 0.1 + Math.sin(now / 200) * s * 0.2, -s * 1.1, -s * 0.4); ctx.stroke()
  // sack of chunks on the back
  if (carried > 0) {
    const sackR = s * (0.3 + carried * 0.08)
    ctx.fillStyle = '#caa15e'
    circle(ctx, -s * 0.5, -s * 0.35, sackR); ctx.fill()
    ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = s * 0.06; ctx.stroke()
    ctx.fillStyle = '#4a2b16'
    circle(ctx, -s * 0.6, -s * 0.4, sackR * 0.18); ctx.fill()
  }
  // body
  ctx.fillStyle = mouseFur
  rr(ctx, -s * 0.7, -s * 0.45, s * 1.4, s * 0.95, s * 0.45); ctx.fill()
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
  // eye
  if (caught) {
    ctx.strokeStyle = '#11131a'; ctx.lineWidth = s * 0.07
    ctx.beginPath(); ctx.moveTo(hx + s * 0.1, -s * 0.2); ctx.lineTo(hx + s * 0.3, 0); ctx.moveTo(hx + s * 0.3, -s * 0.2); ctx.lineTo(hx + s * 0.1, 0); ctx.stroke()
  } else {
    ctx.fillStyle = '#11131a'; circle(ctx, hx + s * 0.2, -s * 0.12, s * 0.08); ctx.fill()
  }
  // nose + whiskers
  ctx.fillStyle = '#e87a90'; circle(ctx, hx + s * 0.42, -s * 0.02, s * 0.07); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1
  for (const dy of [-0.06, 0.02, 0.1]) { ctx.beginPath(); ctx.moveTo(hx + s * 0.42, -s * 0.02 + s * dy); ctx.lineTo(hx + s * 0.9, -s * 0.06 + s * dy * 1.6); ctx.stroke() }
  // feet
  ctx.fillStyle = mouseFur2
  const fp = game.moving ? Math.sin(now / 90) * s * 0.18 : 0
  circle(ctx, -s * 0.2 + fp, s * 0.5, s * 0.12); ctx.fill()
  circle(ctx, s * 0.2 - fp, s * 0.5, s * 0.12); ctx.fill()
  ctx.restore()
}

// ─── Awareness vignette ──────────────────────────────────────────────────────
const drawAwarenessVignette = (ctx: CanvasRenderingContext2D, now: number): void => {
  const aw = game.awareness
  if (aw < 50) return
  const k = (aw - 50) / 50
  const pulse = game.catState === 'alert' || game.catState === 'pounce' ? (Math.sin(now / 120) * 0.5 + 0.5) : 1
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(200,30,30,${0.06 + k * 0.32 * pulse})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

// ─── Eating Frenzy overlay ───────────────────────────────────────────────────
const drawFrenzy = (ctx: CanvasRenderingContext2D, now: number): void => {
  ctx.fillStyle = 'rgba(8,18,12,0.82)'; ctx.fillRect(0, 0, W, H)
  const cx = W / 2, cy = H * 0.46
  const r = Math.min(W, H) * 0.26
  // shrinking cookie
  const frac = 1 - game.frenzy / 100
  drawCookie(ctx, cx, cy, r * (0.4 + 0.6 * frac))
  // mouse zipping around it
  const ang = now / 120
  const mr = r * (0.5 + 0.6 * frac)
  drawMouse(ctx, cx + Math.cos(ang) * mr, cy + Math.sin(ang) * mr, Math.min(W, H) * 0.05, Math.cos(ang) > 0 ? 1 : -1, 0, now, false)
}

// ─── Master draw ─────────────────────────────────────────────────────────────
let lastNow = 0
export const drawScene = (ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void => {
  if (w !== W || h !== H) configureGeometry(w, h)
  if (pathPts.length - 1 !== game.seg) buildPath()
  const dt = lastNow ? Math.min(now - lastNow, 50) : 16
  lastNow = now

  drawBackground(ctx, now)

  if (phase.value === 'frenzy') {
    drawFrenzy(ctx, now)
    drainFx(); updateParticles(ctx, dt)
    return
  }

  drawPath(ctx)
  drawHole(ctx)
  drawZones(ctx, now)

  // Cookie + Cat at the far end.
  const ck = pointAt(game.seg)
  const cs = Math.min(W, H) * 0.075
  drawCat(ctx, ck.x + cs * 0.4, ck.y - cs * 1.6, cs, game.catState, now)
  drawCookie(ctx, ck.x, ck.y, unit * 2.0)

  // Mouse at the tweened path position.
  const mp = pointAt(game.renderPos)
  const caught = phase.value === 'dead'
  drawMouse(ctx, mp.x, mp.y, unit * 0.9, game.facing, game.chunksCarried, now, caught)

  drainFx()
  updateParticles(ctx, dt)
  drawAwarenessVignette(ctx, now)
}
