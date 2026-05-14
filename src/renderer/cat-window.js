const catApi = window.openOmniClaw?.cat
const surface = document.querySelector('.cat-surface')
const stage = document.querySelector('#cat-stage')
const image = document.querySelector('#cat-image')
const bubble = document.querySelector('#cat-bubble')

const states = Object.freeze({
  HIDDEN: 'hidden',
  APPEARING: 'appearing',
  IDLE: 'idle',
  DRAGGING: 'dragging',
  PREPARING: 'preparing',
  RUNNING: 'running',
  COMPLETED: 'completed',
})

const stableStates = new Set([states.IDLE, states.PREPARING, states.RUNNING, states.COMPLETED])

const assets = Object.freeze({
  show: '../asserts/cat/anim_cat_show.webp',
  idle: '../asserts/cat/ic_cat_normal.png',
  drag: '../asserts/cat/anim_cat_dragging.webp',
  dragFallback: '../asserts/cat/ic_cat_normal_dragging.png',
  startDoing: '../asserts/cat/anim_cat_start_doing.webp',
  doing: '../asserts/cat/anim_cat_doing_task.webp',
  doingFallback: '../asserts/cat/ic_cat_doing_task.png',
  endDoing: '../asserts/cat/anim_cat_end_doing.webp',
  finish: '../asserts/cat/anim_cat_finish.webp',
})

const animationDurations = Object.freeze({
  appearing: 1000,
  preparing: 1050,
  completedEnd: 980,
  completedFinish: 1500,
})

const copy = Object.freeze({
  hidden: '',
  appearing: '你好',
  idle: '待命',
  dragging: '移动中',
  preparing: '准备执行',
  running: '执行中',
  completed: '已完成',
})

let currentState = states.HIDDEN
let currentStableState = states.IDLE
let previousStableState = states.IDLE
let firstShow = true
let stateTimer = null
let suppressNextImageError = false
let dragSession = null

function clearStateTimer() {
  if (stateTimer) {
    clearTimeout(stateTimer)
    stateTimer = null
  }
}

function reportState(state) {
  catApi?.reportState?.(state)
}

function setBubble(text, visible = true) {
  bubble.textContent = text
  bubble.classList.toggle('is-visible', visible && text.length > 0)
}

function setSurfaceState(state) {
  surface.classList.toggle('is-dragging', state === states.DRAGGING)
  surface.classList.toggle('is-running', state === states.RUNNING)
  surface.classList.toggle('is-completed', state === states.COMPLETED)
}

function setImage(src, fallback = assets.idle) {
  suppressNextImageError = false
  image.dataset.fallback = fallback
  image.removeAttribute('src')

  requestAnimationFrame(() => {
    image.src = src
  })
}

function enterState(state, options = {}) {
  if (!Object.values(states).includes(state)) {
    return
  }

  clearStateTimer()
  currentState = state

  if (stableStates.has(state)) {
    currentStableState = state
  }

  setSurfaceState(state)
  setBubble(copy[state], state !== states.HIDDEN)
  reportState(state)

  switch (state) {
    case states.HIDDEN:
      setImage(assets.idle)
      setBubble('', false)
      break
    case states.APPEARING:
      setImage(assets.show, assets.idle)
      stateTimer = setTimeout(() => {
        firstShow = false
        enterState(states.IDLE)
      }, animationDurations.appearing)
      break
    case states.IDLE:
      setImage(assets.idle)
      break
    case states.DRAGGING:
      setImage(assets.drag, assets.dragFallback)
      break
    case states.PREPARING:
      setImage(assets.startDoing, assets.doingFallback)
      stateTimer = setTimeout(() => {
        if (currentState === states.PREPARING) {
          setImage(assets.doingFallback)
        }
      }, animationDurations.preparing)
      break
    case states.RUNNING:
      setImage(assets.doing, assets.doingFallback)
      break
    case states.COMPLETED:
      setImage(assets.endDoing, assets.doingFallback)
      stateTimer = setTimeout(() => {
        if (currentState !== states.COMPLETED) {
          return
        }

        setImage(assets.finish, assets.idle)
        stateTimer = setTimeout(() => {
          if (currentState === states.COMPLETED) {
            enterState(states.IDLE)
          }
        }, animationDurations.completedFinish)
      }, animationDurations.completedEnd)
      break
    default:
      setImage(assets.idle)
  }

  if (options.fromDragRestore) {
    setBubble(copy[state], state !== states.HIDDEN)
  }
}

function handleCommand(payload) {
  const nextState = payload?.state

  if (!nextState) {
    return
  }

  if (nextState === states.IDLE && firstShow && currentState === states.HIDDEN) {
    enterState(states.APPEARING)
    return
  }

  enterState(nextState)
}

image.addEventListener('error', () => {
  if (suppressNextImageError) {
    return
  }

  const fallback = image.dataset.fallback || assets.idle
  suppressNextImageError = true
  image.src = fallback
})

stage.addEventListener('pointerdown', async (event) => {
  if (!catApi) {
    return
  }

  stage.setPointerCapture(event.pointerId)

  const bounds = await catApi.dragStart()

  dragSession = {
    pointerId: event.pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    startBounds: bounds,
    active: false,
  }
})

stage.addEventListener('pointermove', async (event) => {
  if (!dragSession || dragSession.pointerId !== event.pointerId) {
    return
  }

  const dx = Math.abs(event.screenX - dragSession.startScreenX)
  const dy = Math.abs(event.screenY - dragSession.startScreenY)

  if (!dragSession.active && Math.max(dx, dy) > 4) {
    previousStableState = currentStableState
    dragSession.active = true
    enterState(states.DRAGGING)
  }

  if (!dragSession.active) {
    return
  }

  catApi.dragMove({
    startBounds: dragSession.startBounds,
    deltaX: event.screenX - dragSession.startScreenX,
    deltaY: event.screenY - dragSession.startScreenY,
  })
})

stage.addEventListener('pointerup', async (event) => {
  if (!dragSession || dragSession.pointerId !== event.pointerId) {
    return
  }

  const wasDragging = dragSession.active
  dragSession = null
  stage.releasePointerCapture(event.pointerId)

  if (!wasDragging) {
    return
  }

  await catApi.dragEnd()
  enterState(previousStableState, { fromDragRestore: true })
})

stage.addEventListener('pointercancel', async (event) => {
  if (!dragSession || dragSession.pointerId !== event.pointerId) {
    return
  }

  const wasDragging = dragSession.active
  dragSession = null

  if (wasDragging) {
    await catApi?.dragEnd?.()
    enterState(previousStableState, { fromDragRestore: true })
  }
})

stage.addEventListener('contextmenu', async (event) => {
  event.preventDefault()
  await catApi?.togglePanel?.()
})

catApi?.onCommand?.(handleCommand)
enterState(states.HIDDEN)
