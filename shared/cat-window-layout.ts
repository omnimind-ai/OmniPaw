export const catAssetRenderSize = 116
export const catDefaultRenderSize = 86
export const catWindowRenderSize = 276
export const catWindowBottomInset = 16

export const defaultCatContentArea = Object.freeze({
  x: Math.round((catWindowRenderSize - catDefaultRenderSize) / 2),
  y: catWindowRenderSize - catWindowBottomInset - catDefaultRenderSize,
  width: catDefaultRenderSize,
  height: catDefaultRenderSize,
})
