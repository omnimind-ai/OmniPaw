import { appBridge } from '@/bridge/app'
import { createDefaultCatVisualAppearance, resolveCatVisualAppearance } from './appearance'
import { createCatVisualStateMachine } from './state-machine'
import { createCatVisualView } from './view'

let appearance = createDefaultCatVisualAppearance()

const view = createCatVisualView({
  reportHitArea: (area) => {
    void appBridge.cat.setHitArea(area)
  },
})

const stateMachine = createCatVisualStateMachine({
  appearance,
  render: view.render,
  reportState: (state) => appBridge.cat.reportState(state),
})

function applyAppearance(nextAppearance: typeof appearance): void {
  appearance = nextAppearance
  view.applyLayout(appearance.layout)
  stateMachine.applyAppearance(appearance)
}

async function loadAppearance(): Promise<void> {
  try {
    applyAppearance(resolveCatVisualAppearance(await appBridge.catAppearance.current()))
  } catch {
    applyAppearance(createDefaultCatVisualAppearance())
  }
}

view.applyLayout(appearance.layout)
view.showInitialImage(appearance.assets.idle)

const unsubscribeCommand = appBridge.cat.onCommand(stateMachine.handleCommand)
const unsubscribeAppearance = appBridge.catAppearance.onChanged((event) => {
  applyAppearance(resolveCatVisualAppearance(event.current))
})

window.addEventListener(
  'beforeunload',
  () => {
    unsubscribeCommand()
    unsubscribeAppearance()
    stateMachine.dispose()
    view.dispose()
  },
  { once: true }
)

void loadAppearance()
