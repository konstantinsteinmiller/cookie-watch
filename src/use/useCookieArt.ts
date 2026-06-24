/**
 * Cookie Watch — canvas renderer + VFX (free-movement revision).
 *
 * Pure view layer: reads the engine's per-frame render model (`game`) and the
 * phase, owns NO game logic. The scene is laid out like the Game & Watch sketch:
 * a kitchen floor running left→right, the mouse hole at home (left), the giant
 * cookie on its plate at the goal (right), and the looming Cat-Eye head centred
 * up top with two long mechanical "tick-tock" arms that swing like pendulums
 * and STOMP when the cat catches the Mouse moving.
 *
 * Everything is crisp programmatic vectors so the game is fully playable before
 * any art lands; each sprite has an image-override hook that swaps to a file in
 * `/public/images/props/` the moment one exists (see `imageFor`). DPR scaling is
 * applied by the scene; we draw in CSS pixels.
 */
import { game, phase, type CatState, type FxEvent } from '@/use/useCookieGame'
import { prependBaseUrl } from '@/utils/function'

// ─── Layout / geometry ───────────────────────────────────────────────────────
let W = 0
let H = 0
let portrait = true
let unit = 24            // base sizing unit ~ min(W,H)/N
let floorY = 0           // y of the floor the Mouse walks on
let homeX = 0            // x of the mouse hole (pos 0)
let goalX = 0            // x of the cookie (pos 1)
let headX = 0            // Cat-Eye head centre
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
  headY = H * (portrait ? 0.20 : 0.18)
  return true
}

/** Screen x for a continuous track position p∈[0..1] (0 home → 1 cookie). */
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
  kind: 'spark' | 'ring' | 'crumb' | 'slash' | 'puff' | 'text'
  rot?: number; vr?: number; text?: string
}
let particles: Particle[] = []
const MAX_PARTICLES = 220

const spawnFx = (e: FxEvent): void => {
  const ax = xAt(e.at)
  switch (e.kind) {
    case 'noise': {
      particles.push({
        x: headX,
        y: headY,
        vx: 0,
        vy: 0,
        life: 0,
        max: 520,
        size: unit * (0.8 + e.power),
        color: '#ffd23c',
        kind: 'ring'
      })
      break
    }
    case 'step': {
      for (let i = 0; i < 3; i++) particles.push({
        x: ax,
        y: floorY,
        vx: (Math.random() - 0.5) * 40,
        vy: -20 - Math.random() * 30,
        life: 0,
        max: 320,
        size: unit * 0.12,
        color: '#d9c7a0',
        kind: 'puff'
      })
      break
    }
    case 'crumb': case 'grab': {
      for (let i = 0; i < 6; i++) particles.push({
        x: goalX,
        y: floorY - unit * 1.2,
        vx: (Math.random() - 0.5) * 160,
        vy: -60 - Math.random() * 120,
        life: 0,
        max: 620,
        size: unit * (0.12 + Math.random() * 0.14),
        color: ['#c98a3c', '#a86a28', '#e0b070'][i % 3]!,
        kind: 'crumb',
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10
      })
      break
    }
    case 'deposit': {
      for (let i = 0; i < Math.round(10 + e.power * 14); i++) {
        const a = Math.random() * Math.PI * 2
        particles.push({
          x: homeX,
          y: floorY,
          vx: Math.cos(a) * (60 + Math.random() * 160),
          vy: -Math.abs(Math.sin(a)) * (120 + Math.random() * 140),
          life: 0,
          max: 700,
          size: unit * 0.16,
          color: '#ffd23c',
          kind: 'spark'
        })
      }
      particles.push({
        x: homeX,
        y: floorY - unit * 1.6,
        vx: 0,
        vy: -28,
        life: 0,
        max: 900,
        size: unit,
        color: '#fff3b0',
        kind: 'text',
        text: '+100'
      })
      break
    }
    case 'pounce': {
      particles.push({
        x: ax,
        y: floorY,
        vx: 0,
        vy: 0,
        life: 0,
        max: 380,
        size: unit * 2.8,
        color: '#ff5a4d',
        kind: 'slash'
      })
      for (let i = 0; i < 12; i++) particles.push({
        x: ax,
        y: floorY,
        vx: (Math.random() - 0.5) * 280,
        vy: -Math.random() * 200,
        life: 0,
        max: 520,
        size: unit * 0.2,
        color: '#d9c7a0',
        kind: 'puff'
      })
      break
    }
    case 'escape': {
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2
        particles.push({
          x: ax,
          y: floorY - unit,
          vx: Math.cos(a) * 120,
          vy: Math.sin(a) * 120 - 40,
          life: 0,
          max: 600,
          size: unit * 0.2,
          color: '#9be8a8',
          kind: 'spark'
        })
      }
      break
    }
    case 'trap': {
      particles.push({
        x: ax,
        y: floorY,
        vx: 0,
        vy: 0,
        life: 0,
        max: 320,
        size: unit * 1.6,
        color: '#ffffff',
        kind: 'slash'
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
      p.vy += (560 * dt) / 1000
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
const drawBackground = (ctx: CanvasRenderingContext2D): void => {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#16331f')
  g.addColorStop(0.5, '#1c3a26')
  g.addColorStop(1, '#0e271a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Moonlight pool behind the cookie.
  const moon = ctx.createRadialGradient(goalX, floorY - unit, 0, goalX, floorY - unit, Math.max(W, H) * 0.5)
  moon.addColorStop(0, 'rgba(120,180,140,0.16)')
  moon.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = moon
  ctx.fillRect(0, 0, W, H)

  // Floor band + skirting.
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(0, floorY, W, H - floorY)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, floorY)
  ctx.lineTo(W, floorY)
  ctx.stroke()
}

// ─── Mouse hole (home) ───────────────────────────────────────────────────────
const drawHole = (ctx: CanvasRenderingContext2D): void => {
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

// ─── Cookie + plate (goal) ─────────────────────────────────────────────────────
const drawCookie = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
  const frac = Math.max(0.12, game.chunksInCookie / Math.max(1, game.cookieTotal))
  const rr2 = r * (0.55 + 0.45 * frac)
  const g = ctx.createRadialGradient(x - rr2 * 0.3, y - rr2 * 0.3, rr2 * 0.2, x, y, rr2)
  g.addColorStop(0, '#e3b873'); g.addColorStop(1, '#b07c3a')
  ctx.fillStyle = g
  const eaten = (1 - frac) * Math.PI * 1.2
  ctx.beginPath()
  ctx.arc(x, y, rr2, eaten, Math.PI * 2, false)
  if (eaten > 0.01) ctx.lineTo(x, y)
  ctx.closePath(); ctx.fill()
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

const drawPlate = (ctx: CanvasRenderingContext2D): void => {
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
  drawCookie(ctx, x, y - unit * 1.5, unit * 1.7)
}

// ─── Cat-Eye head + mechanical arms ────────────────────────────────────────────
/** One pendulum / stomp arm. `side` −1 = reaches left, +1 = reaches right. */
const drawArm = (ctx: CanvasRenderingContext2D, side: 1 | -1, now: number): void => {
  const shoulderX = headX + side * unit * 2.2
  const shoulderY = headY + unit * 1.4
  // Rest target: a point out toward this side of the floor.
  const restX = headX + side * (W * 0.28)
  const restAng = Math.atan2(floorY - unit * 1.5 - shoulderY, restX - shoulderX)
  // Idle swing like a metronome; faster as the cat grows alert.
  const beat = game.catState === 'asleep' ? 900 : game.catState === 'stirring' ? 420 : 600
  const swingAmp = game.catState === 'asleep' ? 0.10 : 0.16
  let ang = restAng + Math.sin(now / beat + (side > 0 ? 0 : Math.PI)) * swingAmp

  // Stomp: the active arm drives down to the Mouse's position.
  const stomping = game.catState === 'alert' && game.stompArm === side
  let reach = Math.hypot(restX - shoulderX, floorY - unit * 1.5 - shoulderY)
  if (stomping) {
    const targetX = xAt(game.renderPos)
    const targetY = floorY - unit * 0.4
    const targAng = Math.atan2(targetY - shoulderY, targetX - shoulderX)
    const t = game.stompT
    ang = restAng + (targAng - restAng) * t
    reach = Math.hypot(targetX - shoulderX, targetY - shoulderY) * (0.5 + 0.5 * t)
  }

  const elbowX = shoulderX + Math.cos(ang) * reach * 0.55
  const elbowY = shoulderY + Math.sin(ang) * reach * 0.55
  const pawX = shoulderX + Math.cos(ang) * reach
  const pawY = shoulderY + Math.sin(ang) * reach

  // Segmented mechanical rod.
  ctx.strokeStyle = stomping ? '#c63a30' : '#5a6170'
  ctx.lineWidth = unit * 0.34
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(shoulderX, shoulderY)
  ctx.lineTo(elbowX, elbowY)
  ctx.lineTo(pawX, pawY)
  ctx.stroke()
  // joint bolts
  ctx.fillStyle = '#2c313c'
  for (const [jx, jy] of [[shoulderX, shoulderY], [elbowX, elbowY]] as const) {
    circle(ctx, jx, jy, unit * 0.2)
    ctx.fill()
  }
  // segment notches
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = unit * 0.34
  ctx.setLineDash([unit * 0.12, unit * 0.28])
  ctx.beginPath()
  ctx.moveTo(shoulderX, shoulderY)
  ctx.lineTo(elbowX, elbowY)
  ctx.lineTo(pawX, pawY)
  ctx.stroke()
  ctx.setLineDash([])
  // paw / fist
  ctx.fillStyle = stomping ? '#d6463b' : '#454b58'
  circle(ctx, pawX, pawY, unit * 0.55)
  ctx.fill()
  ctx.fillStyle = '#e8b6c2'
  for (const o of [-0.28, 0, 0.28]) {
    circle(ctx, pawX + o * unit, pawY + unit * 0.35, unit * 0.12)
    ctx.fill()
  }
}

const drawCatHead = (ctx: CanvasRenderingContext2D, state: CatState, now: number): void => {
  const s = unit * 2.0
  const breathe = Math.sin(now / 700) * s * 0.03
  const y = headY + breathe
  // head
  ctx.fillStyle = '#3f4552'
  circle(ctx, headX, y, s)
  ctx.fill()
  // ears
  const earFlick = state === 'stirring' ? Math.sin(now / 90) * 0.25 : 0
  ctx.fillStyle = '#3f4552'
  for (const sgn of [-1, 1]) {
    ctx.save()
    ctx.translate(headX + sgn * s * 0.7, y - s * 0.7)
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
  ctx.ellipse(headX, y + s * 0.35, s * 0.7, s * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()
  // eyes
  const eyeY = y - s * 0.1
  const red = state === 'alert' || state === 'pounce'
  if (state === 'asleep') {
    ctx.strokeStyle = '#11131a'
    ctx.lineWidth = s * 0.07
    ctx.lineCap = 'round'
    for (const sgn of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(headX + sgn * s * 0.36, eyeY, s * 0.2, 0.3, Math.PI - 0.3)
      ctx.stroke()
    }
  } else {
    const open = state === 'stirring' ? 0.45 : 1
    // Rev 2: once the cat has locked on, the pupils slide to track the Mouse's
    // position (gaze 0 = looking home/left, 1 = looking at the cookie/right) and
    // dip down toward the floor where the prey is.
    const tracking = game.catTracking
    const px = (game.catGazeX - 0.5) * s * 0.30
    const py = tracking ? s * 0.07 : 0
    for (const sgn of [-1, 1]) {
      const ex = headX + sgn * s * 0.36
      ctx.fillStyle = '#f3e9b0'
      ctx.beginPath()
      ctx.ellipse(ex, eyeY, s * 0.26, s * 0.24 * open + s * 0.02, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = red ? '#ff3b3b' : '#1a1a1a'
      circle(ctx, ex + px, eyeY + py, s * 0.13 * open + s * 0.02)
      ctx.fill()
      if (red) {
        ctx.fillStyle = 'rgba(255,80,70,0.5)'
        circle(ctx, ex + px, eyeY + py, s * 0.3)
        ctx.fill()
      }
    }
  }
  // nose
  ctx.fillStyle = '#e87a90'
  ctx.beginPath()
  ctx.moveTo(headX - s * 0.1, y + s * 0.2)
  ctx.lineTo(headX + s * 0.1, y + s * 0.2)
  ctx.lineTo(headX, y + s * 0.34)
  ctx.closePath()
  ctx.fill()
  // grin when alert (the sketch's wide cat grin)
  if (red) {
    ctx.strokeStyle = '#11131a'
    ctx.lineWidth = s * 0.06
    ctx.beginPath()
    ctx.arc(headX, y + s * 0.3, s * 0.4, 0.15, Math.PI - 0.15)
    ctx.stroke()
  }
  // Zzz while asleep
  if (state === 'asleep') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `900 ${Math.round(s * 0.4)}px Angry, sans-serif`
    ctx.textAlign = 'left'
    const zb = Math.sin(now / 500) * s * 0.08
    ctx.fillText('z', headX + s * 0.9, y - s * 0.8 + zb)
    ctx.font = `900 ${Math.round(s * 0.6)}px Angry, sans-serif`
    ctx.fillText('Z', headX + s * 1.2, y - s * 1.15 - zb)
  }
}

// ─── Mouse (vectorized) ──────────────────────────────────────────────────────
const drawMouse = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, facing: 1 | -1, carried: number, now: number, caught: boolean, playDead = false): void => {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(facing, 1)
  const walking = game.moving
  const bob = walking ? Math.abs(Math.sin(now / (game.running ? 55 : 90))) * s * 0.12 : Math.sin(now / 700) * s * 0.03
  ctx.translate(0, -bob)
  // Rev 2: when the player stops, the Mouse flips belly-up and "plays dead"
  // (X over the eyes). Caught keeps the old squashed pose. Hidden but not yet
  // flat-out still crouches a touch.
  const xEyes = caught || playDead
  if (playDead) ctx.scale(1, -1)
  else if (game.hidden && phase.value === 'playing') ctx.scale(1, 0.86)
  // tail
  ctx.strokeStyle = mouseFur2; ctx.lineWidth = s * 0.12; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.2)
  ctx.quadraticCurveTo(-s * 1.3, s * 0.1 + Math.sin(now / 200) * s * 0.2, -s * 1.1, -s * 0.4); ctx.stroke()
  // sack of chunks
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
  if (xEyes) {
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
  const fp = walking ? Math.sin(now / (game.running ? 55 : 90)) * s * 0.2 : 0
  circle(ctx, -s * 0.2 + fp, s * 0.5, s * 0.12); ctx.fill()
  circle(ctx, s * 0.2 - fp, s * 0.5, s * 0.12); ctx.fill()
  ctx.restore()
}

// ─── Danger vignette ───────────────────────────────────────────────────────────
const drawDangerVignette = (ctx: CanvasRenderingContext2D, now: number): void => {
  const danger = game.catState === 'awake' || game.catState === 'alert' || game.catState === 'stirring'
  if (!danger) return
  const k = game.catState === 'alert' ? 1 : game.catState === 'awake' ? 0.7 : 0.4
  const pulse = game.catState === 'alert' ? (Math.sin(now / 110) * 0.5 + 0.5) : 1
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(200,30,30,${0.06 + k * 0.3 * pulse})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

// ─── Eating Frenzy overlay ───────────────────────────────────────────────────
const drawFrenzy = (ctx: CanvasRenderingContext2D, now: number): void => {
  ctx.fillStyle = 'rgba(8,18,12,0.82)'; ctx.fillRect(0, 0, W, H)
  const cx = W / 2, cy = H * 0.46
  const r = Math.min(W, H) * 0.26
  const frac = 1 - game.frenzy / 100
  drawCookie(ctx, cx, cy, r * (0.4 + 0.6 * frac))
  const ang = now / 120
  const mr = r * (0.5 + 0.6 * frac)
  drawMouse(ctx, cx + Math.cos(ang) * mr, cy + Math.sin(ang) * mr, Math.min(W, H) * 0.05, Math.cos(ang) > 0 ? 1 : -1, 0, now, false)
}

// ─── Master draw ─────────────────────────────────────────────────────────────
let lastNow = 0
export const drawScene = (ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void => {
  if (w !== W || h !== H) configureGeometry(w, h)
  const dt = lastNow ? Math.min(now - lastNow, 50) : 16
  lastNow = now

  drawBackground(ctx)

  if (phase.value === 'frenzy') {
    drawFrenzy(ctx, now)
    drainFx(); updateParticles(ctx, dt)
    return
  }

  // Cat arms behind the props, head above everything.
  drawArm(ctx, -1, now)
  drawArm(ctx, 1, now)

  drawHole(ctx)
  drawPlate(ctx)

  // Mouse on the floor at the smoothed track position.
  const mx = xAt(game.renderPos)
  const caught = phase.value === 'dead'
  const playDead = game.playingDead && phase.value === 'playing'
  drawMouse(ctx, mx, floorY - unit * 0.55, unit * 0.9, game.facing, game.chunksCarried, now, caught, playDead)

  drawCatHead(ctx, game.catState, now)

  drainFx()
  updateParticles(ctx, dt)
  drawDangerVignette(ctx, now)
}
