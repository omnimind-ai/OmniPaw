import assert from 'node:assert/strict'
import {
  chatSlashItemMatches,
  findChatSlashQuery,
  parseChatSkillMentions,
  replaceChatSlashQuery,
  serializeChatSkillMentions,
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

assert.deepEqual(
  parseChatSkillMentions('/writer /frontend-design 撰写页面', ['writer', 'frontend-design']),
  {
    skillIds: ['writer', 'frontend-design'],
    text: '撰写页面',
  }
)
assert.deepEqual(parseChatSkillMentions('/unknown 保留原文', ['writer']), {
  skillIds: [],
  text: '/unknown 保留原文',
})
assert.equal(
  serializeChatSkillMentions(['writer', 'writer', 'frontend-design'], '撰写页面'),
  '/writer /frontend-design 撰写页面'
)
assert.equal(serializeChatSkillMentions(['writer'], ''), '/writer ')

process.stdout.write('chat slash menu smoke passed\n')
