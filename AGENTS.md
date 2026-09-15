# MTG Simulator 项目协作说明

唯一维护仓库为 `Ordoviciancn/MTGAPRO-I`，源码和正式发行包均发布至该仓库。`Ordoviciancn/MTG-Simulator` 为归档迁移入口。

软件显示名为 MTG Simulator，仓库和下载文件使用 ASCII 名称 MTG-Simulator。保留原安装 appId 与 MTG Simulator 用户数据目录，避免更名导致已有牌组和运行配置丢失。

## 项目定位

目标是高度忠实复现 MTGA 对局内体验的双人客户端，采用 Forge 无头规则核心 + Java Bridge + Node 房间服务 + React/WebGL 表现层。旧手动牌桌已于 2026-09-12 全部移除，当前唯一入口是 Forge 对局客户端；不得恢复旧规则路径或手动命令。

## 技术与目录

- 前端：React、Vite、TypeScript，主要代码位于 `src/client`。
- 服务端：Express、WebSocket `ws`，位于 `src/server`；Forge 路径为 `/forge`。
- 协议与类型：`src/shared/arenaProtocol.ts`、`matchProtocol.ts`、`forgeTypes.ts`。
- Windows 启动与远程联机脚本：`scripts`。
- 用户文档：`README.md`；快速工程上下文：`PROJECT_CONTEXT.md`。

## 常用命令

```powershell
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm start
```

修改消息协议时，必须同步检查 `src/shared/arenaProtocol.ts`、`src/server/forgeRooms.ts` 和 `src/client/ArenaClient.tsx`。提交前运行 `pnpm test` 和 `pnpm build`。

## 长期约束

- 隐藏信息的公开边界必须由服务端或独立状态模型保证，不能只靠 CSS 隐藏。
- 手牌、牌库、看顶和换备等私密操作不得泄露真实卡名到公开记录。
- 正常房间状态当前只保存在服务端内存中；重启服务后房间消失。
- 卡图来源为 Scryfall，不提交批量卡图、缓存、`dist`、`node_modules` 或 `tools/*.exe`。
- Windows PowerShell 脚本优先使用 ASCII 提示文字，避免 Windows PowerShell 5 的无 BOM UTF-8 解析问题。
- 保持中英文界面字典同步；卡名、聊天和玩家输入不自动翻译。

## Git 约定

- 只提交当前任务产生且已验证的文件，不包含构建产物或来源不明的改动。
- 阶段提交信息使用简体中文，准确概括产出。
- 不改写历史，不执行破坏性 Git 命令，不自动推送远端。

## 视觉与验证

- `src/client/forgeArena.css`、`forgeArt.css` 提供竞技场外观；纸雕场景背景位于 `public/art/storybook-arena.png`。
- 旧快照推测特效（`roomEffects.ts`、`useRoomEffects.ts`、`ArenaEffects.tsx`、`ArenaHud.tsx`、`i18n.ts`、`styles.css`、`arena.css`）已随旧牌桌删除；动画由 `SemanticCanvas.tsx` 与 `animationTimeline.ts` 承接，动画不得修改规则状态或推断敌方私密牌名。录屏交互依据见 `docs/录屏交互观察.md`。
- 旧手动牌桌双客户端测试 `tests/server.test.ts` 与 `tests/roomEffects.test.ts` 已随旧基线删除；现行应用测试见 `tests/` 下其余文件。
- 服务端端口可由 `PORT` 指定，默认 8787；开发前端仍连接 8787。
- 新实现由 Forge 独占全部规则状态；Node 与客户端不得维护第二套规则。旧手动牌桌已于 2026-09-12 移除，不得恢复旧规则路径。
- 新动画只能由经可见性裁剪的语义事件驱动；快照用于同步和落位，不用于推测规则事件。
- Forge 方案与状态见 `docs/Forge接入与三维客户端方案.md`；未完成真实引擎集成测试前不得宣称已接入。
- 实施规划与阶段验收见 `docs/superpowers/plans/2026-09-11-Forge自动对局与竞技场交互规划.md`；真人 Match 验证优先于扩大美术范围。
- 全面重构范围与模块处置以 `docs/全面重构审计与差距矩阵.md` 为准，其替代旧规划中保留手动房间的最终产品要求。

- Forge 核心构建使用 `scripts/构建Forge核心.ps1 -JdkHome <JDK目录>`；通过 reactor 执行 forge-ai 及依赖的测试、打包和运行时 classpath 导出。源码、Maven、依赖缓存和产物均留在忽略目录 `.local-tools/`。

- `pnpm forge:probe` 需要 JAVA_HOME 和已构建的 Forge，验证 Node/Java 进程及最小 Game 状态，不等同于完整对局或网页接入；相关变更需运行该验证。
- `pnpm forge:human-smoke` 需要 JAVA_HOME 和 forge-gui 构建，验证双 Human Match 到达选择窗口与双座位视图；输出 `fullGameVerified:false`，不能作为完整对局验收。Java 用户目录与 APPDATA/LOCALAPPDATA 必须隔离到会话目录，退出后等待进程关闭再清理。
- `pnpm forge:human-smoke --opening` 验证起手及出地；`--spell` 使用隔离测试种子验证闪电击目标、自动支付和伤害结算。测试种子禁止通过网络协议设置。
- Forge 客户端入口为根页面 `/`（桌面版仍加载 `/?forge`，查询参数不再切换界面），WebSocket 路径为 `/forge`；入口由 `ArenaClient.tsx`、`forgeRooms.ts`、`arenaProtocol.ts` 组成。
- `pnpm forge:network-smoke` 使用临时本机端口、真实 Java 引擎和独立网络座位验证施法、身份、回执与重连；`--complete` 继续伤害对局直至 Forge 宣布终局。该测试不是所有机制覆盖证明。
- `pnpm forge:network-smoke --combat` 验证灰棕熊夹具中的召唤失调、攻击、阻挡互换和未阻挡的 2 点伤害。战斗关系由 Java 投影，客户端 `CombatLines.tsx` 只连接已确认的对象引用。
- `pnpm forge:network-smoke --x` 验证 Blaze 的 X=1、两块山脉支付、伤害、越界数值拒绝和数值窗口中的独立完全操控切换；数值选择不得由优先权确认替代。
- `pnpm forge:network-smoke --scry` 验证 Preordain 占卜的可选移底、牌库顶排序和实际抽牌。Java 使用 Forge 的列表选择界面路径，私密选项只路由给所属座位；引擎原始异常留在服务端，不广播可能包含私密卡名的异常文本。
- Forge 房间凭据由服务端随机生成，浏览器按标签页保存；客户端自报 playerId 不能代替座位凭据。外部卡牌引用按观察者分配，离开可见区域后失效。
- 新建界面默认 BO3，协议未指定 bestOf 时仍为 BO1。`pnpm forge:bo3-smoke` 验证真实三局、四次私密换备、比分与换入牌抓取；第一局由引擎掷币随机决定先后手，第二、三局由上一局败者在确认窗选择先手或后手。备牌可用 Sideboard 分节或 SB: 前缀导入；换备沿用 Forge 顺序调用。
- `pnpm forge:network-smoke --manland` 验证米斯拉的工厂活化为 2/2。展示分区按当前生物类型优先于地类型，规则身份仍由 Forge 保留。
- 牌桌根容器使用 overflow:clip，避免浏览器聚焦底部手牌时程序性滚动导致牌手徽章跳动。`useCardDrag.ts` 只负责指针表现，合法出牌仍交给 Forge。
- `desktop/` 管理 Electron 宿主和打包。`pnpm desktop:build` 输出 `release/MTG Simulator-win32-x64/MTG Simulator.exe`，须保留整个目录；构建输出不提交。完整包内置 Forge/JDK，开发宿主可使用外部固定版本运行库，配置见 `desktop/桌面版说明.md`。
- 桌面通过 FORGE_WORKSPACE_ROOT、JAVA_HOME 指定主持运行库；远程模式只绑定 127.0.0.1，主持模式绑定 0.0.0.0，默认 PORT=0。渲染器使用沙箱与上下文隔离，原生牌组保存只能通过受限 preload 接口访问固定用户数据文件。MTG_DESKTOP_SMOKE 不替代 Java 对局测试。
- `ArenaLobby.tsx` 提供服务器选择、牌组工坊和房间目录；`deckLibrary.ts` 管理带版本的本地牌组库。网页使用 localStorage，桌面使用用户数据目录，保存失败必须显示错误且保留已有记录。`serverAddress.ts` 规范化地址，座位凭据必须按服务器隔离。
- 目录协议只公开房间码、房主名称、人数、赛制与状态，不得包含牌表、凭据或引擎对象。相关变更运行 `tests/forgeRoomDirectory.test.ts`。专用 Windows 服务由 `scripts/启动联机服务器.ps1` 启动，部署说明见 `docs/联机部署与玩家分发.md`；未实际部署不得声称已有公共服务。
- 新客户端动画入口为 `SemanticCanvas.tsx`，只消费 Forge 语义事件。当前 Java 崩溃时冻结房间，不声称可恢复崩溃前引擎状态。
- Forge 客户端装饰层为 `ArenaAtmosphere.tsx` 与 `forgeArt.css`，后者在基础布局样式之后加载。环境光与徽章不接收指针事件；环境装饰不得读取或推断游戏规则，减少动态效果偏好下关闭漂浮微光。
- `animationTimeline.ts` 管理语义事件序号与固定正常速度的并行动画；重连以快照事件序号重新建立基线。后台标签页与减少动态效果偏好消费事件但不积压视觉效果，任何动画控制不得发送规则指令。

## 完整发行包与旧版边界

- `pnpm desktop:bundle` 在设置 Temurin JDK 17 的 JAVA_HOME 后生成内置 Forge/JDK/Cloudflared 的发行目录；`pnpm desktop:installer` 封装单文件 NSIS 安装器。Quick Tunnel 程序必须先按固定版本及 SHA256 校验，不能把未下载完成的 exe 打包。
- 发行程序检测 runtime/manifest.json 自动启用内置引擎，不依赖源项目/Git/Maven。FORGE_SESSION_ROOT 指向用户数据目录；运行库相对路径必须校验，安装目录不写会话数据。
- 桌面 QuickTunnel 仅代理自己的回环 HTTP 服务，经受限 IPC 启停；不能接受网页传入可执行文件或任意目标地址。退出应用时停止隧道。公网实测脚本为 scripts/forge-public-smoke.ts，不把同机双客户端测试称为异地双物理机验收。
- 旧手动网页版已移出项目存档；源码与发行包仅包含 Forge 客户端。不得恢复旧手动入口或导入外部存档。

- 主动返回大厅通过 leave 协议关闭房间、使旧凭据失效并立即释放服务器房间名额；普通网络断开仍保留五分钟重连窗口。关闭房间后禁止继续启动 Java 或发布引擎消息。

- StackPanel 展示真实堆叠与 recentStackEvents；后者由服务器按座位保存最近 16 条 cast/resolve 事件，重连随房间视图恢复，不依赖动画队列或快照差异推断。效果描述必须先通过可见性裁剪，未公开来源不得生成真实卡图请求。
