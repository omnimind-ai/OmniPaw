import { type ComponentPublicInstance, type ComputedRef, nextTick, onBeforeUnmount, ref } from 'vue'

export type MessageScrollAreaRef = Element | ComponentPublicInstance | null

interface UseChatWorkspaceScrollOptions {
  isHomeMode: ComputedRef<boolean>
  hasMessages: ComputedRef<boolean>
}

const bottomFollowThreshold = 48

export function useChatWorkspaceScroll({ isHomeMode, hasMessages }: UseChatWorkspaceScrollOptions) {
  const messagesScrollArea = ref<MessageScrollAreaRef>(null)
  const followingLatestMessage = ref(true)
  const showScrollToBottom = ref(false)

  let messagesScrollViewport: HTMLElement | null = null
  let messagesResizeObserver: ResizeObserver | null = null
  let observedMessagesContent: Element | null = null
  let autoScrollFrame = 0
  let programmaticScrollUntil = 0
  let scrollStateTimer = 0
  let lastKnownScrollHeight = 0

  onBeforeUnmount(() => {
    cleanupMessageScroll()
  })

  function setMessagesScrollArea(value: MessageScrollAreaRef) {
    if (!value) {
      detachMessageScrollViewport()
      messagesScrollArea.value = null
      return
    }

    messagesScrollArea.value = value
    void nextTick(() => attachMessageScrollViewport())
  }

  function attachMessageScrollViewport() {
    const nextViewport = resolveMessageScrollViewport()
    if (nextViewport === messagesScrollViewport) {
      attachMessagesResizeObserver()
      updateScrollFollowState()
      return
    }

    detachMessageScrollViewport()
    messagesScrollViewport = nextViewport
    messagesScrollViewport?.addEventListener('scroll', updateScrollFollowState, { passive: true })
    attachMessagesResizeObserver()
    updateScrollFollowState()
  }

  function detachMessageScrollViewport() {
    messagesScrollViewport?.removeEventListener('scroll', updateScrollFollowState)
    messagesScrollViewport = null
    detachMessagesResizeObserver()
    lastKnownScrollHeight = 0
  }

  function attachMessagesResizeObserver() {
    const content = messagesScrollViewport?.firstElementChild ?? null
    if (content === observedMessagesContent) return

    detachMessagesResizeObserver()
    observedMessagesContent = content
    if (!content || typeof ResizeObserver === 'undefined') return

    messagesResizeObserver = new ResizeObserver(() => {
      updateScrollFollowState()
    })
    messagesResizeObserver.observe(content)
  }

  function detachMessagesResizeObserver() {
    messagesResizeObserver?.disconnect()
    messagesResizeObserver = null
    observedMessagesContent = null
  }

  function scheduleScrollToLatest(behavior: ScrollBehavior = 'auto', force = false) {
    if (isHomeMode.value || (!force && !followingLatestMessage.value)) {
      updateScrollFollowState()
      return
    }

    followingLatestMessage.value = true
    showScrollToBottom.value = false
    programmaticScrollUntil = Math.max(
      programmaticScrollUntil,
      performance.now() + programmaticScrollDuration(behavior)
    )

    if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = requestAnimationFrame(() => {
      autoScrollFrame = requestAnimationFrame(() => {
        autoScrollFrame = 0
        scrollToLatestMessage(behavior, true)
      })
    })
  }

  function scrollToLatestMessage(behavior: ScrollBehavior = 'smooth', force = true) {
    attachMessageScrollViewport()
    const viewport = messagesScrollViewport
    if (!viewport || (!force && !followingLatestMessage.value)) return

    programmaticScrollUntil = performance.now() + programmaticScrollDuration(behavior)
    followingLatestMessage.value = true
    showScrollToBottom.value = false
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    })

    if (scrollStateTimer) window.clearTimeout(scrollStateTimer)
    scrollStateTimer = window.setTimeout(
      () => {
        scrollStateTimer = 0
        updateScrollFollowState()
      },
      behavior === 'smooth' ? 350 : 0
    )
  }

  function resetScrollFollowState() {
    followingLatestMessage.value = true
    showScrollToBottom.value = false
    programmaticScrollUntil = 0
  }

  function cleanupMessageScroll() {
    detachMessageScrollViewport()
    if (autoScrollFrame) {
      cancelAnimationFrame(autoScrollFrame)
      autoScrollFrame = 0
    }
    if (scrollStateTimer) {
      window.clearTimeout(scrollStateTimer)
      scrollStateTimer = 0
    }
  }

  function messageScrollRoot() {
    const value = messagesScrollArea.value
    if (!value) return null
    if (value instanceof HTMLElement) return value
    if ('$el' in value) {
      return value.$el instanceof HTMLElement ? value.$el : null
    }
    return null
  }

  function resolveMessageScrollViewport() {
    return (
      messageScrollRoot()?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null
    )
  }

  function isNearMessageBottom(viewport: HTMLElement) {
    return (
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= bottomFollowThreshold
    )
  }

  function programmaticScrollDuration(behavior: ScrollBehavior) {
    return behavior === 'smooth' ? 1200 : 120
  }

  function updateScrollFollowState() {
    const viewport = messagesScrollViewport
    if (!viewport) {
      followingLatestMessage.value = true
      showScrollToBottom.value = false
      lastKnownScrollHeight = 0
      return
    }

    const nearBottom = isNearMessageBottom(viewport)
    const currentScrollHeight = viewport.scrollHeight
    const contentGrew = currentScrollHeight > lastKnownScrollHeight
    lastKnownScrollHeight = currentScrollHeight

    if (!nearBottom && performance.now() < programmaticScrollUntil) return

    if (!nearBottom && contentGrew && followingLatestMessage.value) {
      showScrollToBottom.value = false
      scheduleScrollToLatest('auto', true)
      return
    }

    followingLatestMessage.value = nearBottom
    showScrollToBottom.value = hasMessages.value && !nearBottom
    if (nearBottom) programmaticScrollUntil = 0
  }

  return {
    showScrollToBottom,
    setMessagesScrollArea,
    attachMessageScrollViewport,
    scheduleScrollToLatest,
    scrollToLatestMessage,
    resetScrollFollowState,
    cleanupMessageScroll,
  }
}
