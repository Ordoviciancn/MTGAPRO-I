# MTGAPROⅠ

MTGAPROⅠ 是基于 Forge 规则引擎的万智牌双人桌面模拟器。客户端采用 Electron、React 和 TypeScript，支持本机主持、远程房间、牌组管理以及 BO1 / BO3 对局。

[下载安装包](https://github.com/Ordoviciancn/MTGAPRO-I/releases/latest) · [使用指南](docs/一键联机与完整安装包.md) · [开发文档](docs/开发与构建.md)

## 功能

- **规则处理**：由 Forge 处理费用支付、目标选择、优先权、堆叠、战斗与状态动作。
- **对局模式**：支持 BO1 和 BO3，包括先后手选择与局间换备。
- **牌组管理**：主牌与备牌编辑、文本导入导出、多套牌组本地保存。
- **联机大厅**：服务器连接、房间创建与加入，以及基于 Cloudflare Quick Tunnel 的临时邀请地址。
- **对局界面**：手牌拖拽、目标提示、卡牌预览、堆叠展示与最近结算记录。

## 安装与使用

支持 Windows 10 / 11 x64。完整安装包包含 Forge、Temurin JDK 17 和 Cloudflared，无需额外安装 Java、Node.js 或开发工具。卡牌图片通过网络按需加载。

1. 从 [Releases](https://github.com/Ordoviciancn/MTGAPRO-I/releases/latest) 下载并运行安装程序。
2. 在牌组工坊创建或导入牌组并保存。
3. 主持者创建房间并开启公网联机，将邀请地址发送给对手。
4. 对手连接该地址，加入房间并选择牌组。

主持者须在对局期间保持程序运行。局域网及专用服务器配置见 [联机部署](docs/联机部署与玩家分发.md)。

## 架构

| 模块 | 职责 | 目录 |
| --- | --- | --- |
| Forge Bridge | Java 规则引擎接入与状态投影 | `bridge/forge/` |
| 房间服务 | WebSocket 通信、座位鉴权、命令去重及隐藏信息裁剪 | `src/server/` |
| 客户端 | 对局界面、交互与语义事件动画 | `src/client/` |
| 共享协议 | 客户端与服务端消息及数据类型 | `src/shared/` |
| 桌面宿主 | 本机服务、牌组存储、隧道与安装包 | `desktop/` |

Forge 是唯一规则状态来源。客户端不独立计算结算结果，动画消费服务端按座位裁剪后的语义事件。

## 本地开发

依赖 Node.js 22、pnpm；运行本机规则引擎还需要 Git、Temurin JDK 17 和固定版本 Forge 构建。准备步骤见 [开发与构建](docs/开发与构建.md)。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

默认开发地址为 `http://localhost:5180`，服务端端口为 `8787`，WebSocket 路径为 `/forge`。

```powershell
pnpm test                 # 自动测试
pnpm build                # 类型检查与前端构建
pnpm forge:network-smoke  # 真实 Forge 双座位联机验证
pnpm desktop:bundle       # 生成包含规则运行库的桌面发行目录
pnpm desktop:installer    # 生成 Windows 安装器
```

## 已知限制

- 对局状态保存在主持端内存中，进程退出或崩溃后不支持恢复。
- Quick Tunnel 使用临时地址，其可用性取决于双方网络与隧道服务。
- 卡牌支持取决于固定版本 Forge；复杂交互未实现全量测试，不校验赛制禁限表。
- 当前不提供账号系统、天梯匹配或对局回放。Windows 安装包尚未签名。

## 文档与反馈

完整文档见 [文档索引](docs/README.md)。提交 [Issue](https://github.com/Ordoviciancn/MTGAPRO-I/issues) 时，请提供软件版本、复现步骤、相关牌名及错误信息；不要附带房间凭据或私人数据。

## 第三方组件

规则引擎来自 [Forge](https://github.com/Card-Forge/forge)，卡图通过 [Scryfall](https://scryfall.com/) 加载，公网隧道使用 [Cloudflared](https://github.com/cloudflare/cloudflared)。发行包附带相应第三方许可证及 Forge 对应源码。

本项目为非官方软件，与 Wizards of the Coast 无关联。Magic: The Gathering 及相关卡牌内容的权利归其各自权利方所有。