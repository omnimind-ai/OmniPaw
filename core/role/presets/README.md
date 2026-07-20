# Role Presets

这里集中角色生命周期和内置角色“小万”“小智”的核心预设，优先从这里修改默认行为。

- `xiaowan.ts`: 内置小万角色的展示简介、idle 默认头像来源、人设、知识扫描设置、默认交互和默认礼物引用。
- `xiaozhi.ts`: 内置小智角色的活泼人设、狗狗外观、专属互动和礼物预设。
- `catalog.ts`: 内置角色目录、默认激活角色和各预设引入的配置版本；新配置、重置配置和版本升级都从这里创建角色。
- `interactions.ts`: 交互 ID、每日次数、好感解锁阈值、默认交互文案和反馈的 core 侧 re-export；共享契约源头在 `shared/types/cat-pet.ts`。
- `gifts.ts`: 好感礼物默认配置和内置礼物图片路径 preset。
- `gameplay.ts`: 交互对好感/心情的影响、成功概率、心情文案和运行时回复提示词。
- `appearance.ts`: 内置猫咪/狗狗外观包 ID、名称、说明、默认动画时长和布局。

renderer 侧只能依赖 `shared/` 的纯数据 preset；`src/bridge/app.ts` 中的中性 fallback 角色只用于 bridge 不可用时预览，不镜像内置角色目录。
