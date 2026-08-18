import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const messageList = readFileSync('src/components/chat/ChatMessageList.vue', 'utf8')
const indicatorFunctionStart = messageList.indexOf('function showThinkingIndicator')
const indicatorFunctionEnd = messageList.indexOf('\n}\n', indicatorFunctionStart)
const indicatorFunction = messageList.slice(indicatorFunctionStart, indicatorFunctionEnd + 3)

assert.ok(indicatorFunctionStart >= 0, 'the thinking indicator predicate must exist')
assert.match(indicatorFunction, /!props\.isUserMessage\(record\)/)
assert.match(indicatorFunction, /!isRecordErrored\(record\)/)
assert.match(indicatorFunction, /props\.isMessageStreaming\(record, index\)/)
assert.doesNotMatch(
  indicatorFunction,
  /hasDisplayBlocks|renderSegments/,
  'rendered message parts must not hide the active thinking indicator'
)

const renderSegmentsPosition = messageList.indexOf(
  'v-for="(segment, segmentIndex) in renderSegments(record)"'
)
const runProgressPosition = messageList.indexOf(
  'v-if="!isUserMessage(record) && record.runProgress"'
)
const thinkingIndicatorPosition = messageList.indexOf(
  'v-if="showThinkingIndicator(record, recordIndex)"'
)

assert.ok(renderSegmentsPosition >= 0)
assert.ok(runProgressPosition > renderSegmentsPosition)
assert.ok(
  thinkingIndicatorPosition > runProgressPosition,
  'the active thinking indicator must follow message parts and transient run progress'
)
assert.doesNotMatch(
  messageList,
  /v-else-if="showThinkingIndicator\(record, recordIndex\)"/,
  'transient run progress must not replace the active thinking indicator'
)

process.stdout.write('Chat thinking indicator smoke check passed\n')
