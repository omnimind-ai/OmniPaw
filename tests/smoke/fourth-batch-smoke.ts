import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const rendererBridge = readFileSync('src/bridge/app.ts', 'utf8')
const chatIpc = readFileSync('electron/ipc/chat.ts', 'utf8')
const chatTypes = readFileSync('shared/types/chat.ts', 'utf8')
const settingsTypes = readFileSync('shared/types/settings.ts', 'utf8')
const workspaceTypes = readFileSync('shared/types/local-agent.ts', 'utf8')
const migrations = readFileSync('core/db/migrations.ts', 'utf8')
const composerDock = readFileSync('src/components/chat/ChatComposerDock.vue', 'utf8')

assert.match(rendererBridge, /platform: getFallbackPlatform\(\)/)
assert.match(rendererBridge, /rejectFallbackPersistence<ChatSession>\('chat\.createSession'\)/)
assert.match(
  rendererBridge,
  /rejectFallbackPersistence<SendMessageResponse>\('chat\.sendMessage'\)/
)
assert.match(rendererBridge, /rejectFallbackPersistence<Attachment>\('attachment\.upload'\)/)

assert.match(chatIpc, /tool_profile: _legacyToolProfile/)
assert.match(chatIpc, /max_steps: _legacyMaxSteps/)
assert.doesNotMatch(rendererBridge, /interface BridgeSendMessageRequest[^}]*tool_profile\?:/)
assert.doesNotMatch(rendererBridge, /interface BridgeSendMessageRequest[^}]*max_steps\?:/)

assert.doesNotMatch(chatTypes, /parentMessageId\?:/)
assert.doesNotMatch(chatTypes, /rootMessageId\?:/)
assert.doesNotMatch(chatTypes, /providerMessageId\?:/)
assert.doesNotMatch(chatTypes, /tokenCount\?:/)
assert.doesNotMatch(chatTypes, /extractedTextId\?:/)
assert.doesNotMatch(chatTypes, /extracted_text_id\?:/)
assert.doesNotMatch(settingsTypes, /dataDir\?:/)
assert.doesNotMatch(workspaceTypes, /rootStrategy:/)
assert.doesNotMatch(chatTypes, /AttachmentMediaMetadata/)
assert.doesNotMatch(migrations, /media_metadata_json/)
assert.doesNotMatch(composerDock, /application\/pdf/)
assert.equal(existsSync('core/chat/attachment-processing.ts'), false)

process.stdout.write('fourth batch smoke passed\n')
