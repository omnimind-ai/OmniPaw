# 小猫悬浮窗形象资源包

资源包目录位于 OmniPaw 数据根下的 `cat-appearances/`。每个资源包是一个子目录，必须包含 `manifest.json`。

如果还没有显式选择过形象包，且目录里只有一个有效本地资源包，应用会自动启用它。后续通过 bridge 显式选择后，会以选择结果为准。

也可以在「设置」→「悬浮窗形象」里点击「导入形象包」，选择一个 `.zip` 资源包。压缩包可以把 `manifest.json` 放在根目录，也可以只包含一个顶层资源包目录且该目录内包含 `manifest.json`。导入会解压并复制到数据根的 `cat-appearances/` 下后立即启用；如果包 ID 已存在，会自动派生一个新的 ID，不覆盖已有包。导入后的文件继续支持热重载。

设置页可以删除本地导入的形象包。内置形象包不能删除；如果删除的是当前启用包，应用会自动切回内置形象。

## 目录示例

```text
cat-appearances/
  my-cat/
    manifest.json
    assets/
      idle.png
      show.webp
      drag-transition.webp
      drag.webp
      start.webp
      doing.webp
      end.webp
      finish.webp
      show-fallback.png
      drag-fallback.png
      doing-fallback.png
```

## manifest.json

`manifest.json` 必须是一个 JSON object，当前运行时代码会读取的顶层字段如下：

| 字段 | 必需 | 类型 | 默认/规则 |
| --- | --- | --- | --- |
| `id` | 否 | string | 资源包 ID。会被转成小写，只保留 `a-z`、`0-9`、`_`、`-`，其他字符会变成 `-`；如果缺失或归一化后为空，会使用资源包目录名生成。`builtin` 是保留 ID，不能使用。 |
| `name` | 否 | string | 展示名称。缺失时使用资源包目录名；会 `trim` 并截断到 80 个字符。 |
| `description` | 否 | string | 展示描述。缺失时为空；会 `trim` 并截断到 240 个字符。 |
| `assets` | 是 | object | 资源文件映射。必须至少包含 `idle`。未知资源键和非 string 值会被忽略；已声明的资源如果路径、格式或大小不合法，资源包会变为无效。 |
| `durations` | 否 | object | 状态切换时长，单位毫秒。缺失字段使用默认值；非数字使用默认值；有效数字会四舍五入并限制到 `0` 到 `30000`。 |
| `layout` | 否 | object | 悬浮窗内的视觉缩放和偏移。缺失字段使用默认值；有效数字会限制到允许范围并保留 3 位小数。 |
| `version` | 否 | any | 可作为资源包作者自己的版本元数据。当前代码不读取它，也不影响缓存刷新、导入或选择逻辑。 |

除上表外的顶层字段会被忽略。

```json
{
  "version": 1,
  "id": "my-cat",
  "name": "My Cat",
  "description": "Custom floating cat appearance.",
  "assets": {
    "idle": "assets/idle.png",
    "show": "assets/show.webp",
    "showFallback": "assets/idle.png",
    "dragTransition": "assets/drag-transition.webp",
    "startDoing": "assets/start.webp",
    "doing": "assets/doing.webp",
    "doingFallback": "assets/idle.png",
    "endDoing": "assets/end.webp",
    "finish": "assets/finish.webp",
    "drag": "assets/drag.webp",
    "dragFallback": "assets/idle.png"
  },
  "durations": {
    "appearing": 1000,
    "dragTransition": 1100,
    "preparing": 1050,
    "completedEnd": 980,
    "completedFinish": 1500
  },
  "layout": {
    "scale": 1,
    "offsetX": 0,
    "offsetY": 0
  }
}
```

`assets.idle` 必填，其余资源可选；缺失时会回退到内置小猫素材。资源路径必须留在资源包目录内，不能是空路径，不能包含空字符，不能指向符号链接，支持 `.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`。

`durations` 可选，单位是毫秒：

| 字段 | 默认值 | 范围 | 影响 |
| --- | ---: | ---: | --- |
| `appearing` | `1000` | `0` 到 `30000` | `show` 首次出现动画播放多久后进入空闲 |
| `dragTransition` | `1100` | `0` 到 `30000` | `dragTransition` 播放多久后切到 `drag` 循环 |
| `preparing` | `1050` | `0` 到 `30000` | `startDoing` 播放多久后切到 `doingFallback` |
| `completedEnd` | `980` | `0` 到 `30000` | `endDoing` 播放多久后切到 `finish` |
| `completedFinish` | `1500` | `0` 到 `30000` | `finish` 播放多久后回到空闲 |

`layout` 可选，用来微调资源包在悬浮窗里的视觉大小和位置：

| 字段 | 默认值 | 范围 | 影响 |
| --- | ---: | ---: | --- |
| `scale` | `1` | `0.25` 到 `2` | 图片缩放倍率，以悬浮窗图片容器的底部中心为锚点缩放 |
| `offsetX` | `0` | `-116` 到 `116` | 水平偏移，单位 px，正数向右 |
| `offsetY` | `0` | `-116` 到 `116` | 垂直偏移，单位 px，正数向下 |

内置形象为了兼容旧素材，会使用约 `0.741` 的默认缩放；本地资源包默认不缩放。

## 资源键

最小可用资源包只需要提供 `idle`。如果希望角色风格完整一致，建议提供下表所有资源，尤其是三个 fallback 静态图。

| 键 | 必需 | 用途 | 建议资源 |
| --- | --- | --- | --- |
| `idle` | 是 | 空闲 | 静态 PNG/WebP，透明背景 |
| `show` | 否 | 首次出现动画 | 动图 WebP/GIF/AVIF |
| `showFallback` | 否 | 出现动画加载失败时的静态图 | 静态图，可使用出现动画首帧或 `idle` |
| `dragTransition` | 否 | 进入拖动状态时先播放的过渡动画 | 非循环动图，播放完后切到 `drag` |
| `drag` | 否 | 拖动窗口或拖拽文件 | 循环动图 |
| `dragFallback` | 否 | 拖动图加载失败时的静态图 | 静态图 |
| `startDoing` | 否 | 准备/开始任务 | 动图 |
| `doing` | 否 | 任务运行中 | 循环动图 |
| `doingFallback` | 否 | 任务动画加载失败或准备动画结束后的静态图 | 静态图 |
| `endDoing` | 否 | 任务结束过渡 | 动图 |
| `finish` | 否 | 完成反馈 | 动图或静态图 |

## 图片尺寸和画布

当前悬浮窗窗口尺寸是 `116 x 116 px`，图片实际渲染区域是 `116 x 116 px`，并使用 `object-fit: contain` 等比缩放。

代码不会硬性校验图片像素尺寸，但建议所有资源统一使用：

- `256 x 256 px` 透明画布。
- 角色主体居中，四周保留较小的安全边距，避免被缩放后贴边。
- 所有状态保持相同画布尺寸、相同视觉锚点和相近主体大小，避免状态切换时角色跳动。
- 优先使用透明背景的 PNG/WebP；JPG/JPEG 不支持透明，通常只适合非透明角色素材。

## 格式和大小限制

硬性限制：

- 导入文件必须是 `.zip`。
- 压缩包最大 `128 MB`，最多 `256` 个文件，解压后总大小最大 `256 MB`。
- `manifest.json` 必须是文件，最大 `64 KB`。
- 单个资源文件最大 `20 MB`。
- 资源文件必须位于当前资源包目录内。
- 资源文件不能是符号链接。
- 支持扩展名：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`。

制作建议：

- 静态图优先使用 PNG 或 WebP。
- 动图优先使用 animated WebP，体积和透明支持更适合悬浮窗。
- 单个动图建议控制在 `1 MB` 以内；虽然硬上限是 `20 MB`，过大的动图会增加加载和热重载成本。

## 动图和时长

动图帧数、FPS 和真实播放时长当前不做代码级校验，由浏览器图片解码器播放。状态切换时间由 `durations` 控制：

| 字段 | 默认值 | 影响 |
| --- | ---: | --- |
| `appearing` | `1000` | `show` 首次出现动画播放多久后进入空闲 |
| `dragTransition` | `1100` | `dragTransition` 播放多久后切到 `drag` 循环 |
| `preparing` | `1050` | `startDoing` 播放多久后切到 `doingFallback` |
| `completedEnd` | `980` | `endDoing` 播放多久后切到 `finish` |
| `completedFinish` | `1500` | `finish` 播放多久后回到空闲 |

动图制作建议：

- `show` 的动画时长尽量匹配 `durations.appearing`。
- `dragTransition` 的动画时长尽量匹配 `durations.dragTransition`；它播放完后会切换到 `drag` 循环。
- `startDoing` 的动画时长尽量匹配 `durations.preparing`。
- `endDoing` 的动画时长尽量匹配 `durations.completedEnd`。
- `finish` 的动画时长尽量匹配 `durations.completedFinish`。
- `doing` 和 `drag` 适合做可循环动画。
- `show`、`dragTransition`、`startDoing`、`endDoing`、`finish` 这类过渡动画不建议做明显循环，否则在状态切换前可能重复播放。
