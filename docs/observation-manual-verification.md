# 主动视觉观察手动验证记录

日期：2026-05-26

范围：

- 小猫来源的 `ObservationReactionEvent` 会通过 `cat:observation-reaction` 发送到小猫悬浮窗。
- 点击小猫 ambient reaction 时，`targetSessionKind = 'cat'` 打开 cat panel 并保留来源 cat session。
- 点击小猫 ambient reaction 时，`targetSessionKind = 'chat'` 调用主窗口 `app:open-chat-session`，主窗口跳转到 `#/chat/:targetSessionId`。
- payload 只包含 reaction id、run id、target session id/kind、surface、decision、短文本、capture id 和时间戳；不包含截图 bytes、视觉摘要、Provider payload、工具参数/结果、凭据或绝对路径。

当前记录是代码路径验证，最终需要在有屏幕录制权限和可用视觉模型的桌面环境中补充端到端 UI 验证。
