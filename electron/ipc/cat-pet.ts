import { IPC_CHANNELS } from '@shared/constants'
import type {
  CatPetAction,
  CatPetPerformRequest,
  CatPetUpdateInteractionsRequest,
} from '@shared/types/cat-pet'
import { isCatPetAction } from '@shared/types/cat-pet'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerCatPetIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(options, IPC_CHANNELS.catPet.getState, () =>
    options.runtime.catPetManager.getState()
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.catPet.performAction,
    (_event, request: CatPetPerformRequest | CatPetAction) => {
      const action = typeof request === 'string' ? request : request?.action
      if (!isCatPetAction(action)) {
        throw new Error(`Invalid cat pet action: ${String(action)}`)
      }
      return options.runtime.catPetManager.perform(action)
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.catPet.updateInteractions,
    (_event, request: CatPetUpdateInteractionsRequest) => {
      if (!request || !Array.isArray(request.customInteractions)) {
        throw new Error('Invalid cat pet interaction config request.')
      }
      return options.runtime.catPetManager.updateInteractions(request)
    }
  )
}
