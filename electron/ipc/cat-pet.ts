import { IPC_CHANNELS } from '@shared/constants'
import type {
  CatPetInventoryRequest,
  CatPetPerformRequest,
  CatPetUpdateInteractionsRequest,
} from '@shared/types/cat-pet'
import { CAT_PET_DEBUG_UNLOCK_NEXT_GIFT_ACTION, isCatPetAction } from '@shared/types/cat-pet'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerCatPetIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(options, IPC_CHANNELS.catPet.getState, () =>
    options.runtime.catPetManager.getState()
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.catPet.getInventory,
    (_event, request: CatPetInventoryRequest) => {
      const roleId = request?.roleId?.trim()
      if (!roleId) {
        throw new Error('Invalid cat pet inventory request.')
      }
      return options.runtime.catPetManager.getInventory(roleId)
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.catPet.performAction,
    (_event, request: CatPetPerformRequest | string) => {
      const action = typeof request === 'string' ? request : request?.action
      if (action === CAT_PET_DEBUG_UNLOCK_NEXT_GIFT_ACTION) {
        return options.runtime.catPetManager.debugUnlockNextGift()
      }
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
      if (
        !request ||
        (!Array.isArray(request.interactions) && !Array.isArray(request.customInteractions))
      ) {
        throw new Error('Invalid cat pet interaction config request.')
      }
      return options.runtime.catPetManager.updateInteractions(request)
    }
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.catPet.debugUnlockNextGift, () =>
    options.runtime.catPetManager.debugUnlockNextGift()
  )
}
