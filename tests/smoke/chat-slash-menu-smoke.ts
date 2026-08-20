import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  chatSlashItemMatches,
  findChatSlashQuery,
  parseChatCapabilityMentions,
  replaceChatSlashQuery,
  serializeChatCapabilityMentions,
} from '../../src/components/chat/chat-slash-menu'

const rootQuery = findChatSlashQuery('/ski', 4)
assert.deepEqual(rootQuery, {
  start: 0,
  end: 4,
  query: 'ski',
  signature: '0:4:ski',
})

const inlineQuery = findChatSlashQuery('请使用 /writer', 11)
assert.equal(inlineQuery?.query, 'writer')
assert.equal(inlineQuery?.start, 4)

assert.equal(findChatSlashQuery('https://example.com', 19), null)
assert.equal(findChatSlashQuery('path/to/file', 12), null)

assert.equal(
  chatSlashItemMatches(
    {
      id: 'skill:frontend-design',
      kind: 'skill',
      label: '界面设计',
      description: '设计前端界面',
      token: '/frontend-design',
      keywords: 'frontend design',
      icon: {} as never,
      reference: { kind: 'skill', id: 'frontend-design' },
    },
    'front'
  ),
  true
)

const replaceQuery = findChatSlashQuery('请使用 /w 完成任务', 6)
assert.ok(replaceQuery)
assert.deepEqual(replaceChatSlashQuery('请使用 /w 完成任务', replaceQuery, '/writer '), {
  value: '请使用 /writer 完成任务',
  cursorPosition: 12,
})

const removeQuery = findChatSlashQuery('请使用 /writer 完成任务', 11)
assert.ok(removeQuery)
assert.deepEqual(replaceChatSlashQuery('请使用 /writer 完成任务', removeQuery, ''), {
  value: '请使用 完成任务',
  cursorPosition: 4,
})

assert.deepEqual(
  parseChatCapabilityMentions(
    '/writer /mcp_browser_open 撰写页面',
    ['writer'],
    ['mcp_browser_open']
  ),
  {
    references: [
      { kind: 'skill', id: 'writer' },
      { kind: 'mcp', id: 'mcp_browser_open' },
    ],
    text: '撰写页面',
  }
)
assert.deepEqual(parseChatCapabilityMentions('/unknown 保留原文', ['writer'], []), {
  references: [],
  text: '/unknown 保留原文',
})
assert.deepEqual(parseChatCapabilityMentions('/mcp_browser_open 保留原文', ['writer'], []), {
  references: [],
  text: '/mcp_browser_open 保留原文',
})
assert.equal(
  serializeChatCapabilityMentions(
    [
      { kind: 'skill', id: 'writer' },
      { kind: 'mcp', id: 'mcp_browser_open' },
      { kind: 'skill', id: 'writer' },
    ],
    '撰写页面'
  ),
  '/writer /mcp_browser_open 撰写页面'
)
assert.equal(serializeChatCapabilityMentions([{ kind: 'skill', id: 'writer' }], ''), '/writer ')

const composerSource = readFileSync('src/components/chat/ChatComposer.vue', 'utf8')
const mentionSource = readFileSync(
  'src/components/chat/parts/ComposerCapabilityMentionList.vue',
  'utf8'
)
const menuSource = readFileSync('src/components/chat/ChatSlashMenu.vue', 'utf8')
const dockSource = readFileSync('src/components/chat/ChatComposerDock.vue', 'utf8')
assert.match(composerSource, /if \(selectedCapabilityMentions\.value\.length\) return ''/)
assert.doesNotMatch(composerSource, /slashCommandItems/)
assert.match(composerSource, /slashMcpItems/)
assert.match(mentionSource, /font-semibold.*text-prompt-blue/)
assert.match(mentionSource, /h-6.*leading-6.*md:h-5.*md:text-sm.*md:leading-5/)
assert.match(mentionSource, /translate-y-0\.5/)
assert.match(menuSource, /bottom-\[calc\(100%-1px\)\]/)
assert.doesNotMatch(menuSource, /shadow-xl/)
assert.match(menuSource, /\['skill', 'mcp'\]/)
assert.match(dockSource, /appBridge\.mcp\.listTools\(\)/)

process.stdout.write('chat slash menu smoke passed\n')
