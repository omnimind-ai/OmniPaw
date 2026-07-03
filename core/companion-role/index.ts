import type {
  ImportCompanionRoleCardRequest,
  ImportCompanionRoleCardResponse,
} from '@shared/types/companion-role'
import { importCompanionRoleCard } from './card-importer'

export { CompanionRoleCardImportError } from './card-importer'

export class CompanionRoleService {
  importCard(request: ImportCompanionRoleCardRequest): ImportCompanionRoleCardResponse {
    return importCompanionRoleCard(request)
  }
}
