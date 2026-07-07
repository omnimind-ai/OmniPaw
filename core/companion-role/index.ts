import type {
  ExportCompanionRoleCardRequest,
  ImportCompanionRoleCardRequest,
  ImportCompanionRoleCardResponse,
} from '@shared/types/companion-role'
import { exportCompanionRoleCard } from './card-exporter'
import { importCompanionRoleCard } from './card-importer'

export type { ExportedCompanionRoleCard } from './card-exporter'
export { CompanionRoleCardImportError } from './card-importer'

export class CompanionRoleService {
  importCard(request: ImportCompanionRoleCardRequest): ImportCompanionRoleCardResponse {
    return importCompanionRoleCard(request)
  }

  exportCard(request: ExportCompanionRoleCardRequest): {
    content: string
    defaultFileName: string
  } {
    return exportCompanionRoleCard(request)
  }
}
