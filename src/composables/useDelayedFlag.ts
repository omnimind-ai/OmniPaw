import { onBeforeUnmount, ref, type WatchSource, watch } from 'vue'

export function useDelayedFlag(source: WatchSource<boolean>, delayMs = 300) {
  const visible = ref(false)
  let timer: ReturnType<typeof window.setTimeout> | undefined

  function clearTimer() {
    if (!timer) return
    window.clearTimeout(timer)
    timer = undefined
  }

  watch(
    source,
    (enabled) => {
      clearTimer()

      if (!enabled) {
        visible.value = false
        return
      }

      timer = window.setTimeout(() => {
        visible.value = true
        timer = undefined
      }, delayMs)
    },
    { immediate: true }
  )

  onBeforeUnmount(clearTimer)

  return visible
}
