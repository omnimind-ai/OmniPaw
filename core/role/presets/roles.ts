import type { DesktopCompanionRoleSettings } from '@shared/types/settings'
import { createXiaowanCompanionRolePreset } from './xiaowan'
import { createXiaozhiCompanionRolePreset } from './xiaozhi'

export function createDefaultCompanionRolePresets(): [
  DesktopCompanionRoleSettings,
  DesktopCompanionRoleSettings,
] {
  return [createXiaowanCompanionRolePreset(), createXiaozhiCompanionRolePreset()]
}
