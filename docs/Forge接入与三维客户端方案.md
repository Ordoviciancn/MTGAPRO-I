# Forge 接入与三维客户端方案

## 当前状态

Forge 固定版本的父工程、forge-core、forge-game、forge-ai 和 forge-gui 已构建通过；Node 调用 Java 的最小初始化、抓牌与事件验证已通过。真人桥接代码尚未通过完整运行验收，现有房间仍运行手动牌桌。用户本地录屏已完成交互观察，见 `录屏交互观察.md`，尚未达到逐帧一致。

实施顺序与验收门槛以 [Forge 自动对局与竞技场交互规划](superpowers/plans/2026-09-11-Forge自动对局与竞技场交互规划.md) 为准。

上游：https://github.com/Card-Forge/forge 。本次核对 HEAD 为 `c86308451651af63c1b4a69a2c47f9cd478d53f6`，记录于 `config/forge-source.json`。构建要求来自上游 pom.xml：Java 17，Maven >= 3.8.1。Forge 仓库标注 GPL-3.0；引入、修改与分发上游代码须保留许可证及对应源码安排，不因独立进程就假定免除义务。

## 技术选择

优先完成现有 React/TypeScript 客户端与 Forge 的规则闭环，保留网页联机、牌表导入及工具面板。当前场景采用图片、CSS 与浏览器动画；只有实际性能和美术需求支持时，再引入 Three.js 三维战场或独立客户端。

Unity + URP 是需要独立桌面客户端、重度三维场景和编辑器美术流程时的备选。两条路线都通过相同协议连接 Java 进程，不把 Java 引擎移植成 C#。暂不要求安装 Unity。

## 权威状态与玩家选择

Forge 独立 Java 进程拥有自动房间的全部规则状态；Node 服务管理连接、房间与玩家身份。手动房间保持现有逻辑，自动房间不能调用手动 moveCard 或 setLife 改写规则状态。

已核对的上游接口：

- `forge-game/.../Game.java`：创建对局、访问 GameView，使用 subscribeToEvents 订阅已发生事件。
- `forge-game/.../player/PlayerController.java`：包含费用支付、目标/模式选择、攻防宣告、调度、替代效应等交互点；不能只适配施放和结算两个按钮。
- `forge-game/.../event/`：事件输出供界面、日志和动画使用。现有类不能直接完整序列化给客户端，须按玩家可见性转换。

设计中的桥接协议是本项目新增协议，不是声称 Forge 已有 HTTP API。命令携带 matchId、requestId、状态版本和服务器绑定的玩家身份；玩家选择携带引擎发出的 promptId 与合法选项 ID。重复请求不重复支付，过期选择拒绝并刷新状态。未知选择类型明确中断并报告，不默认替玩家选第一项。

游戏线程负责串行推进。浏览器等待玩家选择时，Java 对局暂停而不是阻塞 Node 服务。每个玩家分别生成脱敏视图；公开事件不可带入对手手牌名、牌库顺序和未公开目标信息。重连先恢复快照与待选问题，不重播已完成费用或伤害。

## 动画层

由引擎事件驱动动画队列，界面动画完成与否不决定规则结果。抽牌沿牌库到手牌轨迹移动，未知卡只显示牌背；施放从手牌进入堆叠，目标线连接已公开目标；结算、伤害与区域移动依事件顺序呈现。战斗涉及攻击宣告、阻挡关系、接触反馈与伤害数字。

卡牌保持完整尺寸与比例，横置仅旋转。场景使用原创竞技场、灯光、粒子、材质和音效；按参考视频分析节奏和布局，不把视频截图当可交互界面。提供减少动画、跳过积压动画及重连直接落位的路径。

## 实施验收顺序

1. 安装 JDK 17 和 Maven 3.9.x，执行 `powershell -File scripts/检查Forge环境.ps1`，再核对版本。
2. 获取固定版本上游，在隔离目录编译 forge-game 及依赖，启动最小真实对局；记录资源加载与运行依赖。
3. 适配玩家选择与视图：双客户端完成调度、费用、响应、结算、攻击和阻挡，核验隐藏信息、过期请求与重连。
4. 接入事件驱动的三维演示场景，先完成一条真实施放—响应—结算链，再扩展美术和战斗特效。
5. 依据可访问的视频逐段整理镜头、时序与动效差异，运行两客户端完整对局和性能检查后开放自动房间。

当前未完成上述运行验收，不显示“Forge 已连接”或“完整自动结算”等状态。

参考：
- https://github.com/Card-Forge/forge/blob/master/pom.xml
- https://github.com/Card-Forge/forge/blob/master/forge-game/src/main/java/forge/game/player/PlayerController.java
- https://github.com/Card-Forge/forge/blob/master/forge-game/src/main/java/forge/game/Game.java
- https://threejs.org/
- https://docs.unity3d.com/Manual/urp/urp-introduction.html

## 本机构建

已验证 Temurin 17.0.20.1 与 Maven 3.9.16。源码位于 `.local-tools/forge`，Maven 与依赖缓存同样放在 `.local-tools`，不提交到版本控制。源码检出需包含父工程声明的子模块目录；真人控制器需要构建 forge-gui 及其依赖。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/构建Forge核心.ps1 -JdkHome "D:/Program Files/JDK"
```

脚本核对固定 Git 提交，通过 Maven reactor 构建并运行测试；只在脚本执行期间设置 JAVA_HOME，不修改系统环境。可用 `-MavenPath` 和 `-ForgePath` 覆盖默认位置。代理使用调用环境的 MAVEN_OPTS，不在脚本内固定代理服务器。

构建结果：Forge Parent / Core / Game / AI / GUI 全部 SUCCESS。产物为各模块 target 内的 JAR，不能当作已经提供网页对局服务的独立程序。下一阶段仍需验证卡牌资源初始化、玩家选择适配器、按玩家脱敏的快照与事件桥接。

## Node 到 Java 的验证入口

构建脚本同时生成 Maven 解析的运行时 classpath，避免把构建插件的旧依赖混入引擎运行环境。执行：

```powershell
$env:JAVA_HOME = "D:/Program Files/JDK"
pnpm forge:probe
```

`scripts/forge-probe.ts` 检查上游版本后以独立进程启动 `bridge/forge/ForgeProbe.java`，设置 60 秒超时并校验结构化结果。临时参数文件置于 `.local-tools`，退出后清理。

Java 验证程序从上游 Mountain 卡牌脚本构造卡牌、创建包含两名 AI 控制器玩家的真实 Game 对象，将三张牌加入牌库后调用 Forge 抓牌函数，并确认事件订阅收到事件。输出必须是两名玩家、牌库两张、手牌一张。

这是固定测试场景，不对外暴露房间接口，不含身份验证或双客户端可见性逻辑。它没有启动 Match.startGame，没有完整加载全卡数据库，也没有验证费用、优先权或咒语结算；`matchStarted:false` 必须保留以明确边界。现阶段不可将此命令的成功作为自动房间上线依据。
