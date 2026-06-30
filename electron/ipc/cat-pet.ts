import { IPC_CHANNELS } from '@shared/constants'
import type { CatPetAction, CatPetPerformRequest } from '@shared/types/cat-pet'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

const VALID_ACTIONS = new Set<CatPetAction>(['pat', 'tease'])

export function registerCatPetIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(options, IPC_CHANNELS.catPet.getState, () =>
    options.runtime.catPetManager.getState()
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.catPet.performAction,
    (_event, request: CatPetPerformRequest | CatPetAction) => {
      const action = typeof request === 'string' ? request : request?.action
      if (!action || !VALID_ACTIONS.has(action)) {
        throw new Error(`Invalid cat pet action: ${String(action)}`)
      }
      return options.runtime.catPetManager.perform(action)
    }
  )
}
