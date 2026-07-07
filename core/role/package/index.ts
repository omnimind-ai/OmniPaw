import type {
  ExportCompanionRoleCardRequest,
  ImportCompanionRoleCardRequest,
  ImportCompanionRoleCardResponse,
} from '@shared/types/companion-role'
import { exportCompanionRoleCard } from './exporter'
import { importCompanionRoleCard } from './importer'

export type { ExportedCompanionRoleCard } from './exporter'
export { CompanionRoleCardImportError } from './importer'

export class CompanionRoleService {
  importCard(request: ImportCompanionRoleCardRequest): ImportCompanionRoleCardResponse {
    return importCompanionRoleCard(request)
  }

  exportCard(request: ExportCompanionRoleCardRequest): {
    data: Buffer
    defaultFileName: string
  } {
    return exportCompanionRoleCard(request)
  }
}
