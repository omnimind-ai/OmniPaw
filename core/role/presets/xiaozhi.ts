import type { CatPetGiftConfig, CatPetInteractionConfig } from '@shared/types/cat-pet'
import type { DesktopCompanionRoleSettings } from '@shared/types/settings'
import { BUILTIN_DOG_APPEARANCE_PACK_ID } from './appearance'

export const XIAOZHI_COMPANION_ROLE_ID = 'xiaozhi'
export const XIAOZHI_APPEARANCE_PACK_ID = BUILTIN_DOG_APPEARANCE_PACK_ID
export const XIAOZHI_COMPANION_ROLE_INTRODUCTION = '活力满满的桌面搭档'

const XIAOZHI_INTERACTIONS = [
  {
    id: 'pat',
    enabled: true,
    label: '摸摸',
    description: '揉揉小智毛茸茸的脑袋',
    positiveFeedback: '小智开心地蹭了蹭你的手心',
    negativeFeedback: '小智晃晃脑袋，想换个地方摸摸',
  },
  {
    id: 'tease',
    enabled: true,
    label: '逗逗',
    description: '陪精力旺盛的小智玩一会儿',
    positiveFeedback: '小智兴奋地转了个圈',
    negativeFeedback: '小智歪着脑袋，还没明白你的玩法',
  },
  {
    id: 'custom_100',
    enabled: true,
    label: '元气击掌',
    description: '关系更熟悉后解锁的默契击掌',
    positiveFeedback: '小智轻快地和你碰了碰爪',
    negativeFeedback: '小智慢了半拍，马上又期待地抬起爪子',
  },
  {
    id: 'custom_150',
    enabled: true,
    label: '并肩冲刺',
    description: '关系很亲近后解锁的特别鼓劲',
    positiveFeedback: '小智精神抖擞，准备陪你一鼓作气',
    negativeFeedback: '小智趴下来喘口气，但仍守在你身边',
  },
] as const satisfies readonly CatPetInteractionConfig[]

const XIAOZHI_GIFTS = [
  {
    id: 'gift_100',
    enabled: true,
    unlockAffection: 100,
    name: '吱吱响的小球',
    description: '小智最喜欢的玩具，按一下就会发出快乐的声音。',
    image: {
      packagePath: 'presets/dog/gifts/squeaky-ball.png',
      mimeType: 'image/png',
      fileName: 'squeaky-ball.png',
    },
    storyLines: [
      '嘿，我们已经是很有默契的搭档啦！',
      '这个小球是我最喜欢的玩具，现在分你一半。',
      '想休息的时候就看看它，我随时都能陪你玩。',
    ],
  },
  {
    id: 'gift_200',
    enabled: true,
    unlockAffection: 200,
    name: '伙伴名牌',
    description: '刻着伙伴约定的项圈名牌。',
    image: {
      packagePath: 'presets/dog/gifts/collar-nameplate.png',
      mimeType: 'image/png',
      fileName: 'collar-nameplate.png',
    },
    storyLines: [
      '我把最重要的名字认真刻在了这块名牌上。',
      '以后不管跑到哪里，一看到它就知道该回到你身边。',
      '收好哦，这是我们成为最佳搭档的证明！',
    ],
  },
  {
    id: 'gift_300',
    enabled: true,
    unlockAffection: 300,
    name: '闪耀水晶骨',
    description: '好感度满值后，小智送出的珍藏宝物。',
    image: {
      packagePath: 'presets/dog/gifts/crystal-bone.png',
      mimeType: 'image/png',
      fileName: 'crystal-bone.png',
    },
    storyLines: [
      '这是我珍藏了很久、最闪亮的宝物。',
      '因为你是我认定的最佳搭档，所以它当然要送给你。',
      '接下来也一起精神满满地出发吧，我会一直陪着你！',
    ],
  },
] as const satisfies readonly CatPetGiftConfig[]

export function createXiaozhiCompanionRolePreset(): DesktopCompanionRoleSettings {
  return {
    id: XIAOZHI_COMPANION_ROLE_ID,
    name: '小智',
    introduction: XIAOZHI_COMPANION_ROLE_INTRODUCTION,
    avatar: {
      source: 'appearance-idle',
    },
    appearancePackId: XIAOZHI_APPEARANCE_PACK_ID,
    userNickname: '',
    personality: '活泼、好奇、热情，像小狗一样元气十足',
    background: '',
    advanced: {
      enabled: false,
      systemPrompt: '',
      exampleDialogue: '',
      finalInstructions: '',
    },
    petInteractions: createXiaozhiPetInteractionConfigs(),
    petGifts: createXiaozhiPetGiftConfigs(),
    knowledgeSettings: {
      scanDepth: 8,
      maxTokens: 900,
    },
    knowledgeEntries: [],
    source: undefined,
    defaultProviderId: undefined,
    defaultModelId: undefined,
  }
}

export function createXiaozhiPetInteractionConfigs(): CatPetInteractionConfig[] {
  return XIAOZHI_INTERACTIONS.map((interaction) => ({ ...interaction }))
}

export function createXiaozhiPetGiftConfigs(): CatPetGiftConfig[] {
  return XIAOZHI_GIFTS.map((gift) => ({
    ...gift,
    image: { ...gift.image },
    storyLines: [...gift.storyLines],
  }))
}
