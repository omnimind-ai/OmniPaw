import type { CatBounds, CatDockSide, CatHitArea } from '@shared/types/cat'

export function resolveCatDockTargetX(
  workArea: CatBounds,
  dockSide: CatDockSide,
  visualArea: CatHitArea
): number {
  return Math.round(
    dockSide === 'right'
      ? workArea.x + workArea.width - visualArea.x - visualArea.width
      : workArea.x - visualArea.x
  )
}

export function resolveCatVisibleBounds(catBounds: CatBounds, visualArea: CatHitArea): CatBounds {
  return {
    x: catBounds.x + visualArea.x,
    y: catBounds.y + visualArea.y,
    width: visualArea.width,
    height: visualArea.height,
  }
}
