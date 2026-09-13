# MTGAPROⅠ 架构上下文

## 当前入口

Electron 宿主位于 `desktop/`；React 客户端位于 `src/client/`；Node 房间服务位于 `src/server/`，WebSocket 路径 `/forge`。根页面直接加载 Forge 客户端，`?forge` 仅兼容已有链接。旧手动网页版不在本项目中。

## 状态与数据

- Forge 独占规则状态，Java Bridge 位于 `bridge/forge/ForgeHumanBridge.java`。
- Node 负责房间、座位凭据、命令去重和按玩家裁剪隐藏信息；不得创建第二套规则状态。
- 客户端使用快照落位，动画消费已裁剪的语义事件。
- `recentStackEvents` 按座位保存最近 16 条施放/结算记录，随重连视图恢复；面板最小化不清除记录。
- 桌面牌组由受限 preload 接口保存到用户数据目录，升级保留数据；对局规则状态仅驻留内存。
- 主动离开关闭房间并释放容量；意外断线保留五分钟重连机会。

## 运行与发布

完整包包含 Forge/JDK/Cloudflared，玩家不需要外部运行库。打包读取 `config/forge-source.json` 的固定版本，通过相对路径运行内置 Java，用户数据不写入安装目录。

开发与发行命令以 [开发与构建](docs/开发与构建.md) 为准。历史设计与验收文档由 [文档索引](docs/README.md) 导航，不将历史目标当作已实现功能。