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
  let messagesScrollRootElement: HTMLElement | null = null
  let messagesResizeObserver: ResizeObserver | null = null
  let observedMessagesContent: Element | null = null
  let autoScrollFrame = 0
  let programmaticScrollUntil = 0
  let scrollStateTimer = 0
  let userScrollIntentUntil = 0

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
      attachUserScrollIntentListeners()
      attachMessagesResizeObserver()
      updateScrollFollowState()
      return
    }

    detachMessageScrollViewport()
    messagesScrollViewport = nextViewport
    messagesScrollViewport?.addEventListener('scroll', handleViewportScroll, { passive: true })
    attachUserScrollIntentListeners()
    attachMessagesResizeObserver()
    updateScrollFollowState()
  }

  function detachMessageScrollViewport() {
    messagesScrollViewport?.removeEventListener('scroll', handleViewportScroll)
    messagesScrollViewport = null
    detachUserScrollIntentListeners()
    detachMessagesResizeObserver()
  }

  function attachMessagesResizeObserver() {
    const content = messagesScrollViewport?.firstElementChild ?? null
    if (content === observedMessagesContent) return

    detachMessagesResizeObserver()
    observedMessagesContent = content
    if (!content || typeof ResizeObserver === 'undefined') return

    messagesResizeObserver = new ResizeObserver(handleMessagesResize)
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
        scrollToLatestMessage(behavior, force)
      })
    })
  }

  function scheduleScrollToMessage(
    messageId: string,
    behavior: ScrollBehavior = 'auto',
    block: ScrollLogicalPosition = 'start'
  ) {
    if (isHomeMode.value || !messageId) {
      updateScrollFollowState()
      return
    }

    followingLatestMessage.value = false
    if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = requestAnimationFrame(() => {
      autoScrollFrame = requestAnimationFrame(() => {
        autoScrollFrame = 0
        scrollToMessage(messageId, behavior, block)
      })
    })
  }

  function scrollToLatestMessage(behavior: ScrollBehavior = 'smooth', force = true) {
    attachMessageScrollViewport()
    const viewport = messagesScrollViewport
    if (!viewport || (!force && !followingLatestMessage.value)) return
    if (!force && userScrollIntentUntil >= performance.now() && !isNearMessageBottom(viewport)) {
      updateScrollFollowState()
      return
    }

    programmaticScrollUntil = performance.now() + programmaticScrollDuration(behavior)
    followingLatestMessage.value = true
    showScrollToBottom.value = false
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    })

    scheduleScrollStateUpdate(behavior)
  }

  function scrollToMessage(
    messageId: string,
    behavior: ScrollBehavior = 'smooth',
    block: ScrollLogicalPosition = 'start'
  ) {
    attachMessageScrollViewport()
    const viewport = messagesScrollViewport
    const root = messageScrollRoot()
    if (!viewport || !root) return false
    const target = findMessageElement(root, messageId)
    if (!target) return false

    const viewportRect = viewport.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const targetStyle = window.getComputedStyle(target)
    const scrollMarginTop = Number.parseFloat(targetStyle.scrollMarginTop || '0') || 0
    const scrollMarginBottom = Number.parseFloat(targetStyle.scrollMarginBottom || '0') || 0
    let top = viewport.scrollTop + targetRect.top - viewportRect.top - scrollMarginTop

    if (block === 'center') {
      top = viewport.scrollTop + targetRect.top - viewportRect.top
      top -= Math.max(0, viewport.clientHeight - targetRect.height) / 2
    } else if (block === 'end') {
      top = viewport.scrollTop + targetRect.bottom - viewportRect.bottom + scrollMarginBottom
    } else if (block === 'nearest') {
      const above = targetRect.top - scrollMarginTop < viewportRect.top
      const below = targetRect.bottom + scrollMarginBottom > viewportRect.bottom
      if (!above && !below) {
        updateScrollFollowState()
        return true
      }
      if (below) {
        top = viewport.scrollTop + targetRect.bottom - viewportRect.bottom + scrollMarginBottom
      }
    }

    top = Math.max(0, Math.min(top, viewport.scrollHeight - viewport.clientHeight))
    programmaticScrollUntil = performance.now() + programmaticScrollDuration(behavior)
    followingLatestMessage.value = false
    viewport.scrollTo({ top, behavior })
    scheduleScrollStateUpdate(behavior)
    return true
  }

  function resetScrollFollowState(followLatest = true) {
    followingLatestMessage.value = followLatest
    showScrollToBottom.value = false
    programmaticScrollUntil = 0
    userScrollIntentUntil = 0
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

  function attachUserScrollIntentListeners() {
    const root = messageScrollRoot()
    if (root === messagesScrollRootElement) return

    detachUserScrollIntentListeners()
    messagesScrollRootElement = root
    if (!messagesScrollRootElement) return

    messagesScrollRootElement.addEventListener('wheel', markUserScrollIntent, { passive: true })
    messagesScrollRootElement.addEventListener('touchmove', markUserScrollIntent, {
      passive: true,
    })
    messagesScrollRootElement.addEventListener('pointerdown', handlePointerScrollIntent, {
      passive: true,
    })
    messagesScrollRootElement.addEventListener('keydown', handleScrollKeydown)
  }

  function detachUserScrollIntentListeners() {
    messagesScrollRootElement?.removeEventListener('wheel', markUserScrollIntent)
    messagesScrollRootElement?.removeEventListener('touchmove', markUserScrollIntent)
    messagesScrollRootElement?.removeEventListener('pointerdown', handlePointerScrollIntent)
    messagesScrollRootElement?.removeEventListener('keydown', handleScrollKeydown)
    messagesScrollRootElement = null
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

  function findMessageElement(root: HTMLElement, messageId: string) {
    const targetId = `message-${messageId}`
    if (root.id === targetId) return root
    return (
      Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(
        (element) => element.id === targetId
      ) ?? null
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

  function scheduleScrollStateUpdate(behavior: ScrollBehavior) {
    if (scrollStateTimer) window.clearTimeout(scrollStateTimer)
    scrollStateTimer = window.setTimeout(
      () => {
        scrollStateTimer = 0
        updateScrollFollowState()
      },
      behavior === 'smooth' ? 350 : 0
    )
  }

  function handleViewportScroll() {
    updateScrollFollowState()
  }

  function handleMessagesResize() {
    if (followingLatestMessage.value && !isHomeMode.value) {
      scheduleScrollToLatest('auto')
      return
    }

    updateScrollFollowState()
  }

  function markUserScrollIntent() {
    userScrollIntentUntil = performance.now() + 1000
  }

  function handlePointerScrollIntent(event: PointerEvent) {
    const target = event.target
    if (
      target instanceof Element &&
      target.closest('[data-slot="scroll-area-scrollbar"], [data-slot="scroll-area-thumb"]')
    ) {
      markUserScrollIntent()
    }
  }

  function handleScrollKeydown(event: KeyboardEvent) {
    if (
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(
        event.key
      )
    ) {
      markUserScrollIntent()
    }
  }

  function updateScrollFollowState() {
    const viewport = messagesScrollViewport
    if (!viewport) {
      followingLatestMessage.value = true
      showScrollToBottom.value = false
      return
    }

    const nearBottom = isNearMessageBottom(viewport)
    const now = performance.now()
    const userInterrupted = userScrollIntentUntil >= now

    if (!nearBottom && now < programmaticScrollUntil && !userInterrupted) {
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
    scheduleScrollToMessage,
    scrollToLatestMessage,
    scrollToMessage,
    resetScrollFollowState,
    cleanupMessageScroll,
  }
}
