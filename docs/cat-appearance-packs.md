# 桌宠形象资源包契约

> 本页定义资源包必须满足的兼容与安全约束，不提供制作步骤。运行时权威类型位于 `shared/types/cat-appearance.ts`，解析与校验边界位于 `core/role/appearance/`。

## 包边界

- MUST：每个本地资源包是 OmniPaw 数据根 `cat-appearances/` 下的独立目录，并包含根级 `manifest.json`。
- MUST：`manifest.json` 是不超过 64 KiB 的 JSON object。
- MUST：资源包至少提供 `assets.idle`；其他状态资源可选并由运行时回退。
- MUST：资源包 ID 在规范化后非空且不等于内置保留 ID `builtin`、`builtin-dog`。
- MUST：相同 ID 的本地包不得同时成为有效包。
- MUST：内置包不可删除；删除当前本地包后必须回退到默认内置猫咪包。
- MUST：显式选择状态优先于自动选择；未有显式选择且仅存在一个有效本地包时允许自动启用该包。

## Manifest 契约

| 字段 | 必需 | 约束 |
|------|------|------|
| `id` | 否 | 缺失时从目录名派生；只保留小写字母、数字、`_`、`-`，其他字符规范化为 `-` |
| `name` | 否 | 缺失时使用目录名；去除首尾空白并限制为 80 个字符 |
| `description` | 否 | 去除首尾空白并限制为 240 个字符 |
| `assets` | 是 | object；必须包含 `idle`；未知键和非字符串值被忽略 |
| `durations` | 否 | 状态时长 object；无效值回退默认值，有效值限制在 0–30000 ms |
| `layout` | 否 | 视觉缩放和偏移 object；无效值回退默认值 |

- MUST：未列出的 manifest 顶层字段不参与运行时语义。
- MUST：manifest 中声明但无法通过路径、类型、大小或文件校验的资源使整个本地包无效。
- MUST：资源路径为包内相对路径，且不得为空、包含空字符、越过包目录或指向符号链接。
- MUST：资源必须是普通文件，单文件不超过 20 MiB。
- MUST：支持的资源扩展名仅为 `.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`。

## 资源键

| 键 | 必需 | 状态语义 |
|----|------|----------|
| `idle` | 是 | 空闲基准状态 |
| `show` | 否 | 首次出现过渡 |
| `showFallback` | 否 | 出现资源失败时的静态回退 |
| `dragTransition` | 否 | 进入拖动的过渡 |
| `drag` | 否 | 拖动循环状态 |
| `dragFallback` | 否 | 拖动资源失败时的静态回退 |
| `startDoing` | 否 | 进入任务的过渡 |
| `doing` | 否 | 任务进行状态 |
| `doingFallback` | 否 | 任务资源失败或过渡结束时的回退 |
| `endDoing` | 否 | 任务结束过渡 |
| `finish` | 否 | 完成反馈 |

- MUST：所有状态资源使用一致的画布和视觉锚点，避免切换时改变角色位置或命中区域语义。
- MUST：资源加载失败时保持 `idle` 或对应 fallback 可用，不得导致桌宠完全不可见。

## 时长与布局

| 字段 | 默认值 | 约束 |
|------|--------|------|
| `durations.appearing` | `1000` | 控制出现过渡；0–30000 ms |
| `durations.dragTransition` | `1100` | 控制进入拖动过渡；0–30000 ms |
| `durations.preparing` | `1050` | 控制进入任务过渡；0–30000 ms |
| `durations.completedEnd` | `980` | 控制任务结束过渡；0–30000 ms |
| `durations.completedFinish` | `1500` | 控制完成反馈；0–30000 ms |
| `layout.scale` | `1` | 以底部中心为锚点；0.25–2 |
| `layout.offsetX` | `0` | 水平偏移；-116–116 px |
| `layout.offsetY` | `0` | 垂直偏移；-116–116 px |

- MUST：时长与资源的过渡/循环语义匹配，避免过渡资源在状态切换前产生非预期重复。
- MUST：布局变换只改变视觉内容，不改变桌宠窗口与命中窗口共享的坐标语义。
- MUST：本地包缺失布局字段时使用本地默认布局；内置包可保留兼容旧素材的独立布局。

## 导入安全

- MUST：用户导入格式为 `.zip`，且 manifest 只能位于压缩包根目录或唯一顶层包目录内。
- MUST：压缩包不超过 128 MiB、文件数不超过 256、解压总量不超过 256 MiB。
- MUST：导入拒绝绝对路径、父目录穿越、符号链接和其他越界 archive entry。
- MUST：导入与写入使用隔离临时目录，校验完成前不得覆盖现有有效包。
- MUST：导入 ID 冲突时生成新的安全 ID，不覆盖已有包。
- MUST：导入成功后选择状态、资源列表和变更事件保持一致。

## 验证约束

- MUST：manifest、资源安全、导入、删除、选择或回退语义变更通过 `tests/smoke/cat-appearance-smoke.ts`。
- MUST：形象布局或视觉状态变更同时满足 [desktop-pet.md](desktop-pet.md) 的视觉窗/命中窗同步约束。
