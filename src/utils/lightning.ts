/**
 * Reusable branching lightning bolt renderer for canvas 2D.
 *
 * Usage:
 *   drawLightningBolt(ctx, x0, y0, x1, y1, { ... })
 */

export interface LightningOptions {
  /** Max perpendicular jitter in px per segment (default 8) */
  jitter?: number
  /** Number of line segments along the main bolt (default 8) */
  segments?: number
  /** Branch probability per segment 0..1 (default 0.35) */
  branchChance?: number
  /** How long branches are relative to remaining bolt 0..1 (default 0.5) */
  branchLength?: number
  /** Max recursion depth for branches (default 2) */
  maxDepth?: number
  /** Core bolt color (default '#fff') */
  color?: string
  /** Glow color (default '#88ccff') */
  glowColor?: string
  /** Core line width (default 2) */
  lineWidth?: number
  /** Glow line width (default 6) */
  glowWidth?: number
  /** Overall opacity (default 1) */
  alpha?: number
}

const DEFAULT: Required<LightningOptions> = {
  jitter: 8,
  segments: 8,
  branchChance: 0.35,
  branchLength: 0.5,
  maxDepth: 2,
  color: '#fff',
  glowColor: '#88ccff',
  lineWidth: 2,
  glowWidth: 6,
  alpha: 1
}

/** Build a jagged path from (x0,y0) to (x1,y1). */
const buildBoltPath = (
  x0: number, y0: number,
  x1: number, y1: number,
  segs: number,
  jitter: number
): { x: number; y: number }[] => {
  const dx = x1 - x0
  const dy = y1 - y0
  // Perpendicular direction
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = -dy / len
  const ny = dx / len

  const points: { x: number; y: number }[] = [{ x: x0, y: y0 }]
  for (let i = 1; i < segs; i++) {
    const t = i / segs
    const offset = (Math.random() - 0.5) * 2 * jitter
    points.push({
      x: x0 + dx * t + nx * offset,
      y: y0 + dy * t + ny * offset
    })
  }
  points.push({ x: x1, y: y1 })
  return points
}

/** Recursively draw a lightning bolt with branches. */
const drawBoltRecursive = (
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x1: number, y1: number,
  opts: Required<LightningOptions>,
  depth: number
) => {
  const scale = 1 / (1 + depth * 0.5) // branches get thinner
  const segs = Math.max(3, Math.round(opts.segments * scale))
  const points = buildBoltPath(x0, y0, x1, y1, segs, opts.jitter * scale)

  // Draw glow pass
  ctx.strokeStyle = opts.glowColor
  ctx.lineWidth = opts.glowWidth * scale
  ctx.globalAlpha = opts.alpha * 0.35 * scale
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y)
  }
  ctx.stroke()

  // Draw core pass
  ctx.strokeStyle = opts.color
  ctx.lineWidth = opts.lineWidth * scale
  ctx.globalAlpha = opts.alpha * (1 - depth * 0.2)
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y)
  }
  ctx.stroke()

  // Spawn branches
  if (depth < opts.maxDepth) {
    for (let i = 1; i < points.length - 1; i++) {
      if (Math.random() > opts.branchChance) continue
      const p = points[i]!
      // Branch direction: roughly perpendicular with forward bias
      const fwd = { x: x1 - x0, y: y1 - y0 }
      const fwdLen = Math.sqrt(fwd.x * fwd.x + fwd.y * fwd.y) || 1
      const side = Math.random() > 0.5 ? 1 : -1
      const bAngle = Math.atan2(fwd.y, fwd.x) + side * (0.4 + Math.random() * 1.0)
      const remaining = Math.sqrt((x1 - p.x) ** 2 + (y1 - p.y) ** 2)
      const bLen = remaining * opts.branchLength * (0.5 + Math.random() * 0.5)
      const bx = p.x + Math.cos(bAngle) * bLen
      const by = p.y + Math.sin(bAngle) * bLen
      drawBoltRecursive(ctx, p.x, p.y, bx, by, opts, depth + 1)
    }
  }
}

/**
 * Draw a branching lightning bolt from (x0,y0) to (x1,y1).
 * Caller should save/restore ctx state and set globalAlpha afterwards.
 */
export const drawLightningBolt = (
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x1: number, y1: number,
  options?: LightningOptions
) => {
  const opts = { ...DEFAULT, ...options }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Skip shadowBlur — the glow pass in drawBoltRecursive already renders a
  // wider translucent stroke; doubling it with a canvas shadow is redundant
  // and extremely expensive on Firefox.
  drawBoltRecursive(ctx, x0, y0, x1, y1, opts, 0)
  ctx.restore()
  ctx.globalAlpha = 1
}
