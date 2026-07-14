# Role Presets

这里集中角色生命周期和内置角色“小万”的核心预设，优先从这里修改默认行为。

- `xiaowan.ts`: 内置小万角色的展示简介、idle 默认头像来源、人设、知识扫描设置、默认交互和默认礼物引用。
- `interactions.ts`: 交互 ID、每日次数、好感解锁阈值、默认交互文案和反馈的 core 侧 re-export；共享契约源头在 `shared/types/cat-pet.ts`。
- `gifts.ts`: 好感礼物默认配置和内置礼物图片路径 preset。
- `gameplay.ts`: 交互对好感/心情的影响、成功概率、心情文案和运行时回复提示词。
- `appearance.ts`: 内置外观包 ID、名称、说明、默认动画时长和布局。

renderer 侧只能依赖 `shared/` 的纯数据 preset；如果看到 `src/bridge/app.ts` 中有 fallback 调用，它只用于 bridge 不可用时兜底。
