import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const toolCallCard = readFileSync('src/components/chat/parts/ToolCallCard.vue', 'utf8')
const zhLocale = readFileSync('src/i18n/locales/zh-CN.ts', 'utf8')
const enLocale = readFileSync('src/i18n/locales/en-US.ts', 'utf8')

assert.match(toolCallCard, /plan\?\.kind === 'terminal'/)
assert.match(toolCallCard, /terminalApprovalPlan\.value\?\.command\.trim\(\)/)

const approvalPanelPosition = toolCallCard.indexOf('v-if="approvalPending"')
const commandPreviewPosition = toolCallCard.indexOf('v-if="approvalCommand"')
const approveButtonPosition = toolCallCard.indexOf('@click="decideToolApproval(\'approve\')"')

assert.ok(approvalPanelPosition >= 0)
assert.ok(
  commandPreviewPosition > approvalPanelPosition,
  'a pending terminal approval must expose its command without expanding details'
)
assert.ok(
  approveButtonPosition > commandPreviewPosition,
  'the command preview must appear before the approval action'
)
assert.match(toolCallCard, /terminalApprovalPlan\?\.cwd/)
assert.match(zhLocale, /commandPreview: '待执行命令'/)
assert.match(zhLocale, /workingDirectory: '工作目录：\{cwd\}'/)
assert.match(enLocale, /commandPreview: 'Command to execute'/)
assert.match(enLocale, /workingDirectory: 'Working directory: \{cwd\}'/)

process.stdout.write('Chat tool approval smoke check passed\n')
