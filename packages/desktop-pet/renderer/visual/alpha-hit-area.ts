import type { CatHitArea } from '@shared/types/cat'

export interface PixelBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface NormalizedBounds {
  x: number
  y: number
  width: number
  height: number
}

interface FrameRect {
  left: number
  top: number
  width: number
  height: number
}

interface ViewportSize {
  width: number
  height: number
}

interface ResolveHitAreaOptions {
  mirrored?: boolean
  padding?: number
}

export const fullNormalizedBounds: NormalizedBounds = Object.freeze({
  x: 0,
  y: 0,
  width: 1,
  height: 1,
})

const defaultAlphaThreshold = 24
const defaultProjectionDensityRatio = 0.02

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isValidBounds(bounds: PixelBounds | NormalizedBounds): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    isPositiveFinite(bounds.width) &&
    isPositiveFinite(bounds.height)
  )
}

export function findAlphaContentBounds(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  alphaThreshold = defaultAlphaThreshold,
  projectionDensityRatio = defaultProjectionDensityRatio
): PixelBounds | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    rgba.length < width * height * 4
  ) {
    return null
  }

  const rowCounts = new Uint32Array(height)
  const columnCounts = new Uint32Array(width)
  const threshold = Math.min(255, Math.max(1, Math.round(alphaThreshold)))

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((rgba[(y * width + x) * 4 + 3] ?? 0) < threshold) continue
      rowCounts[y] += 1
      columnCounts[x] += 1
    }
  }

  const maxRowCount = Math.max(...rowCounts)
  const maxColumnCount = Math.max(...columnCounts)
  if (maxRowCount === 0 || maxColumnCount === 0) return null

  const densityRatio = Math.min(1, Math.max(0, projectionDensityRatio))
  const rowThreshold = Math.max(1, Math.ceil(maxRowCount * densityRatio))
  const columnThreshold = Math.max(1, Math.ceil(maxColumnCount * densityRatio))
  let left = 0
  let right = width - 1
  let top = 0
  let bottom = height - 1

  while (left <= right && columnCounts[left] < columnThreshold) left += 1
  while (right >= left && columnCounts[right] < columnThreshold) right -= 1
  while (top <= bottom && rowCounts[top] < rowThreshold) top += 1
  while (bottom >= top && rowCounts[bottom] < rowThreshold) bottom -= 1

  if (left > right || top > bottom) return null
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  }
}

export function normalizeAlphaBoundsForContain(
  bounds: PixelBounds,
  sourceWidth: number,
  sourceHeight: number
): NormalizedBounds | null {
  if (!isValidBounds(bounds) || !isPositiveFinite(sourceWidth) || !isPositiveFinite(sourceHeight)) {
    return null
  }

  const containScale = Math.min(1 / sourceWidth, 1 / sourceHeight)
  const renderedWidth = sourceWidth * containScale
  const renderedHeight = sourceHeight * containScale
  const containLeft = (1 - renderedWidth) / 2
  const containTop = (1 - renderedHeight) / 2
  const left = containLeft + bounds.x * containScale
  const top = containTop + bounds.y * containScale
  const right = containLeft + (bounds.x + bounds.width) * containScale
  const bottom = containTop + (bounds.y + bounds.height) * containScale

  return {
    x: Math.min(1, Math.max(0, left)),
    y: Math.min(1, Math.max(0, top)),
    width: Math.max(0, Math.min(1, right) - Math.max(0, left)),
    height: Math.max(0, Math.min(1, bottom) - Math.max(0, top)),
  }
}

export function unionNormalizedBounds(
  current: NormalizedBounds | undefined,
  next: NormalizedBounds
): NormalizedBounds {
  if (!current) return { ...next }

  const left = Math.min(current.x, next.x)
  const top = Math.min(current.y, next.y)
  const right = Math.max(current.x + current.width, next.x + next.width)
  const bottom = Math.max(current.y + current.height, next.y + next.height)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

export function resolveNormalizedHitArea(
  bounds: NormalizedBounds,
  frame: FrameRect,
  viewport: ViewportSize,
  options: ResolveHitAreaOptions = {}
): CatHitArea | null {
  if (
    !isValidBounds(bounds) ||
    !isPositiveFinite(frame.width) ||
    !isPositiveFinite(frame.height) ||
    !isPositiveFinite(viewport.width) ||
    !isPositiveFinite(viewport.height)
  ) {
    return null
  }

  const padding = Math.max(0, options.padding ?? 0)
  const normalizedX = options.mirrored ? 1 - bounds.x - bounds.width : bounds.x
  const rawLeft = frame.left + normalizedX * frame.width - padding
  const rawTop = frame.top + bounds.y * frame.height - padding
  const rawRight = frame.left + (normalizedX + bounds.width) * frame.width + padding
  const rawBottom = frame.top + (bounds.y + bounds.height) * frame.height + padding
  const left = Math.max(0, Math.floor(rawLeft))
  const top = Math.max(0, Math.floor(rawTop))
  const right = Math.min(viewport.width, Math.ceil(rawRight))
  const bottom = Math.min(viewport.height, Math.ceil(rawBottom))

  if (right <= left || bottom <= top) return null
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}
