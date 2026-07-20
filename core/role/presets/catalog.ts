import type { DesktopCompanionRoleSettings } from '@shared/types/settings'
import { createXiaowanCompanionRolePreset, XIAOWAN_COMPANION_ROLE_ID } from './xiaowan'
import { createXiaozhiCompanionRolePreset, XIAOZHI_COMPANION_ROLE_ID } from './xiaozhi'

export interface BuiltinCompanionRolePresetDescriptor {
  readonly id: string
  readonly introducedInSettingsVersion: number
  readonly create: () => DesktopCompanionRoleSettings
}

export const BUILTIN_COMPANION_ROLE_PRESET_CATALOG = [
  {
    id: XIAOWAN_COMPANION_ROLE_ID,
    introducedInSettingsVersion: 1,
    create: createXiaowanCompanionRolePreset,
  },
  {
    id: XIAOZHI_COMPANION_ROLE_ID,
    introducedInSettingsVersion: 2,
    create: createXiaozhiCompanionRolePreset,
  },
] as const satisfies readonly BuiltinCompanionRolePresetDescriptor[]

export const DEFAULT_ACTIVE_COMPANION_ROLE_ID = BUILTIN_COMPANION_ROLE_PRESET_CATALOG[0].id

export function createBuiltinCompanionRolePresets(): DesktopCompanionRoleSettings[] {
  return BUILTIN_COMPANION_ROLE_PRESET_CATALOG.map((preset) => preset.create())
}

export function createBuiltinCompanionRolePreset(
  roleId: string
): DesktopCompanionRoleSettings | undefined {
  return BUILTIN_COMPANION_ROLE_PRESET_CATALOG.find((preset) => preset.id === roleId)?.create()
}

export function createDefaultActiveCompanionRolePreset(): DesktopCompanionRoleSettings {
  return BUILTIN_COMPANION_ROLE_PRESET_CATALOG[0].create()
}
