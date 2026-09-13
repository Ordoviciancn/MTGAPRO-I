# MTGAPROⅠ

基于 Forge 规则引擎的非官方万智牌双人桌面模拟器，由 Ordoviciancn 维护。支持 BO1 / BO3、换备、牌组保存、房间大厅和 Cloudflare Quick Tunnel 联机。

## 安装与对战

从本仓库 Releases 下载 `MTGAPRO-I-Setup-0.1.5.exe`，安装后从桌面快捷方式启动。完整包内置 Forge、Temurin JDK 17 和 Cloudflared，玩家无需安装 Java、Node、Git 或 Maven。卡图需要网络加载。

1. 在牌组工坊导入或编辑主牌和备牌，保存牌组。
2. 主持者在大厅开启公网联机，将生成的临时邀请地址交给对手。
3. 主持者连接本机服务器并创建房间；对手填写邀请地址，连接后加入同一房间。
4. 双方选择牌组并开始对局。规则与可操作时点由 Forge 决定。

结算面板默认最小化，点击“堆叠 / 结算记录”查看，再点击“最小化”隐藏整个面板。最近 16 条施放和结算事件继续保存。主动退出房间会结束该房间并释放名额。

## 当前边界

- 对局由主持者电脑运行；主持者退出、引擎崩溃或服务器重启后，无法恢复原对局。
- Quick Tunnel 是临时地址，不是永久在线服务器；连通性取决于双方网络。
- 支持 Forge 固定版本内可解析的牌表，不能视为所有卡牌和复杂交互均已验收；不校验赛制禁限表。
- 无账号、天梯、回放或完整 MTGA 音画复现。安装器未签名。
- 旧手动网页版已移出项目，不包含在源码仓库或安装包中。

## 文档导航

- [玩家安装与联机](docs/一键联机与完整安装包.md)
- [开发、构建与验证](docs/开发与构建.md)
- [文档索引及历史资料边界](docs/README.md)
- [架构上下文](PROJECT_CONTEXT.md)
- [桌面宿主说明](desktop/桌面版说明.md)

## 开发入口

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

开发界面使用 5180 端口，Node 服务默认 8787。主持开发对局需先构建固定版本 Forge，详见开发文档。

本项目与 Wizards of the Coast 无关联。Magic: The Gathering 及卡牌内容属于其权利方；规则引擎来自 [Forge](https://github.com/Card-Forge/forge)，卡图按需从 Scryfall 加载。发行包携带相关第三方许可证与 Forge 对应源码。