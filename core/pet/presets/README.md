# Pet Presets

这里集中桌宠和内置角色“小万”的核心预设，优先从这里修改默认行为。

- `xiaowan.ts`: 内置小万角色的默认人设、问候语、知识扫描设置和默认外观引用。
- `interactions.ts`: 交互 ID、每日次数、好感解锁阈值、默认交互文案和反馈。
- `gameplay.ts`: 交互对好感/心情的影响、成功概率、心情文案和运行时回复提示词。
- `appearance.ts`: 内置外观包 ID、名称、说明、默认动画时长和布局。

renderer 侧不能直接依赖 core 能力；如果看到 `src/bridge/app.ts` 中有 fallback 文案，它只用于 bridge 不可用时兜底，主预设以这里为准。
