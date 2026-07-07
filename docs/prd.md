# OmniPaw electron重写

我们对于 OmniPaw 的产品期望是：

1. 桌面端助手
2. 主要开源用于宣传 OmniInfer 这个项目（本地部署 7b - 20b 大小的模型，且对端侧模型运行进行优化）
3. 开箱即用，配置用户友好
4. 对 7b - 20b 左右的小模型的小模型进行优化
5. 足够日常使用即可，场景偏向办公/桌面互动/玩具

之前的 OmniPaw 使用的是 OpenClaw 二开 + tauri 套壳的方案，经过几次迭代出现以下问题：

1. 代码仓库难以维护，openclaw的仓库大且耦合度高
2. openclaw 依赖多，打包体积逼近500mb左右
3. tauri 悬浮窗实现不成熟
4. openclaw 的高级功能太复杂，配置太多，用户难上手，且因为1的原因难以进行优化

现在希望通过 electron 重写，脱离之前 gateway 借助 tauri sidecar 模型部署的模式，让OmniPaw更加类似桌面应用

打算基于 Astrbot 的逻辑进行重写，因为Astrbot 的基础更好，且代码更加可维护，可借鉴

基础先实现类似功能：

1. 基础的openai兼容端口的llm对话，预留多rovider 接口
2. 上下文管理
3. skill 能力
4. 定时任务能力（或许可参考openclaw）

大致思路是 ui层 + core（类似backend）层，然后ui 调 core 的相关 api

技术栈暂定 vue + ts
