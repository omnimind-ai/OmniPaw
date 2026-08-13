import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import type { ChatRecord } from '../../src/composables/useMessages'
import { workspaceFileChangesForFinishedTurn } from '../../src/utils/chat-file-changes'

const completedWorkspaceWrite: ChatRecord = {
  id: 'assistant-file-change',
  status: 'complete',
  content: {
    type: 'bot',
    message: [
      {
        type: 'tool_call',
        tool_calls: [
          {
            id: 'workspace-write-1',
            name: 'workspace_file',
            status: 'complete',
            result: {
              ok: true,
              action: 'write',
              entry: { path: 'reports/company.md', sizeBytes: 42 },
            },
          },
        ],
      },
    ],
  },
}

for (const status of ['pending', 'streaming'] as const) {
  assert.deepEqual(
    workspaceFileChangesForFinishedTurn({ ...completedWorkspaceWrite, status }, false),
    [],
    `${status} turns must defer the file summary`
  )
}

assert.deepEqual(
  workspaceFileChangesForFinishedTurn(completedWorkspaceWrite, true),
  [],
  'an active stream must defer the file summary even when the stored status is complete'
)

for (const status of ['complete', 'error', 'aborted'] as const) {
  assert.equal(
    workspaceFileChangesForFinishedTurn({ ...completedWorkspaceWrite, status }, false).length,
    1,
    `${status} turns may show the file summary after streaming settles`
  )
}

const messageList = readFileSync('src/components/chat/ChatMessageList.vue', 'utf8')
const renderSegmentsPosition = messageList.indexOf(
  'v-for="(segment, segmentIndex) in renderSegments(record)"'
)
const fileSummaryPosition = messageList.indexOf('<MessageFilesChangedCard')
assert.ok(renderSegmentsPosition >= 0)
assert.ok(
  fileSummaryPosition > renderSegmentsPosition,
  'file summary must follow all message parts'
)
assert.match(messageList, /fileChangesFor\(record, recordIndex\)/)

process.stdout.write('Chat file changes smoke check passed\n')
