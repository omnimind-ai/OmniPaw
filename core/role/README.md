# Role Core

这里集中角色生命周期相关的 core 模块：

- `appearance/`: 角色在悬浮窗使用的外观包管理、导入、导出和内置外观。
- `package/`: 角色包导入导出服务。
- `growth/`: 桌宠养成状态管理，处理好感度、心情、启动离开时间和互动记录。
- `presets/`: 内置小万、小智、交互、养成数值和内置外观默认预设。

外部调用优先从 `@core/role` 或对应子模块导入，避免再新增分散的 `core/appearance`、`core/companion-role`、`core/pet` 包。
