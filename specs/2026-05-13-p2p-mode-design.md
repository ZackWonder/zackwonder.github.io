# 四子棋 P2P 模式设计

**日期：** 2026-05-13
**作者：** zack
**状态：** 已批准，待实施

## 1. 背景与目标

当前 `src/Game.tsx` 是单机版的四子棋（4 子连珠），两人共用一台设备轮流落子。现要在不引入任何后端的前提下，新增 P2P 在线对战模式：

- 玩家 A（发起方）打开站点 → 进入 P2P 流程 → 选择阵营（蓝/红）→ 复制邀请链接 → 自行通过 IM、邮件等方式发给玩家 B
- 玩家 B 打开链接 → 自动连接到发起方 → 立即开始对战
- 部署仍为 GitHub Pages 纯静态托管，零自有后端

非目标（YAGNI）：观战、聊天、自动重连、自托管 STUN/TURN、反作弊。

## 2. 关键技术决策

### 2.1 信令方案：PeerJS 公共 broker

WebRTC 需要信令服务器交换 SDP 握手包。选用 [`peerjs`](https://peerjs.com/) 库，使用其默认的公共 broker（`0.peerjs.com`）。

**理由：**
- 单邀请链接即可让对方加入，UX 最简单
- 公共 broker 免费，不需要自托管
- 仅传递 WebRTC 握手数据，不传业务信息

**已淘汰的备选：**
- 纯手动 SDP 交换（需要双向链接交换两次，UX 太差）
- Trystero（多源去中心化信令，但 bundle 更大、配置复杂；当前需求用不到）

### 2.2 同步模型：peer-trusts-peer，仅同步动作

两端各自跑同一份游戏逻辑，只通过数据通道同步"动作"（列号）而非"状态"（棋盘）。

| 动作 | 是否同步 | 备注 |
|---|---|---|
| 落子 | 是 | `{type:'move', col, seq}` |
| 再玩一次 | 是 | `{type:'reset', seq}`，任一方可触发 |
| 悔棋 | **P2P 模式禁用**（隐藏按钮） | 避免不同步与争议 |
| 头像升级 / 胜利音效 | 否 | 本地各自触发，结果一致 |

**轮次校验：** 仅当 `aTurn === (localRole === 'A')` 时本地点击棋盘才会触发动作，否则忽略（防误触，非反作弊）。

### 2.3 玩家与颜色映射

```ts
PLAYER_A → 蓝方（blue） → tanson 头像 → 先手
PLAYER_B → 红方（red）  → sherly 头像 → 后手
```

`constants.ts` 不动；仅在 UI 层（`InviteModal`、`PeerStatusBadge`）使用此映射。

## 3. 架构

### 3.1 总体结构（方案 3：拆分 GameContainer + GameView）

```
src/
├── Game.tsx                          编排器：解析 URL hash，路由 mode
├── game/
│   ├── gameLogic.ts                  纯函数：createEmptyBoard / drop / isLine4 / linePoints / applyMove
│   ├── types.ts                      Point / Winner / Player / GameState
│   ├── GameContainer.tsx             状态拥有者：useState + onMove + 可选 transport
│   └── GameView.tsx                  presentational：Crown + Board + 控制按钮
└── p2p/
    ├── protocol.ts                   消息类型 + URL 解析/构造
    ├── usePeerConnection.ts          PeerJS 生命周期 hook
    └── InviteModal.tsx               选阵营 + 邀请链接面板（含连接状态）
```

现有 `Board.tsx`、`Board.css`、`constants.ts`、`effect.ts`、`useSound.ts` 不动。`App.css` 与 `resume.css` 不动。

### 3.2 Mode 状态机（在 `Game.tsx` 内）

```
single ──点"P2P 对战"──▶ p2p-setup ──对方连上──▶ p2p-active
                              │
URL 带 #peer=xxx&role=red ─────┼──直接进入──▶ p2p-active（dialing → connected）
                              │
                              └──返回单机──▶ single
```

### 3.3 GameContainer 接口

```ts
interface GameContainerProps {
  transport?: {
    send: (msg: PeerMessage) => void
    onMessage: (handler: (msg: PeerMessage) => void) => () => void  // returns unsubscribe
    localRole: 'A' | 'B'
  }
}
```

- 无 `transport` → 单机模式：双方落子、可悔棋、可再玩一次
- 有 `transport` → P2P 模式：本地落子时同时 send；监听 onMessage 应用对方动作；悔棋按钮隐藏

## 4. 数据流

### 4.1 单机落子

```
GameView.onClick(col)
  → GameContainer.handleLocalMove(col)
  → applyMove(state, col, currentPlayer)
  → setState
```

### 4.2 P2P 本地落子

```
GameView.onClick(col)
  → guard: aTurn === (localRole === 'A')，否则忽略
  → handleLocalMove(col) → applyMove → setState
  → transport.send({type:'move', col, seq: ++localSeq})
```

### 4.3 P2P 对方落子

```
transport.onMessage({type:'move', col, seq})
  → 校验 seq 是 expectedRemoteSeq；不一致则 warn + 丢弃
  → handleRemoteMove(col) → applyMove → setState
```

### 4.4 Reset

任一方点"再玩一次"：
```
applyReset() + transport?.send({type:'reset', seq: ++localSeq})
```
对方收到 `{type:'reset'}` → applyReset()。

### 4.5 Undo

P2P 模式下 `GameView` 不渲染悔棋按钮。

## 5. P2P 协议

### 5.1 消息格式

```ts
// src/p2p/protocol.ts
export type PeerMessage =
  | { type: 'move'; col: number; seq: number }
  | { type: 'reset'; seq: number }
  | { type: 'hello'; role: 'A' | 'B' }

// seq：递增整数，由发送方维护；用于检测乱序/丢失。
// hello：加入方在数据通道打开后第一时间发送，确认双方角色一致；
//        若发起方收到的 hello.role 与自己阵营冲突，进入 'error' 状态。
```

### 5.2 URL 邀请链接格式

```
https://zackwonder.github.io/#game?peer=<peerId>&role=<red|blue>
```

**重要**：现有 `App.tsx` 已经用 `window.location.hash === '#game'` 触发游戏页。邀请链接必须复用此入口，否则加入方进不到游戏页。因此格式为 `#game?peer=...&role=...`：

- `App.tsx` 的判断改为 `window.location.hash.startsWith('#game')`
- `peerId`：发起方的 PeerJS ID（由 broker 随机分配）
- `role`：**加入方**应扮演的阵营（与发起方相反）
- 例：发起方选蓝方（PLAYER_A），生成的链接里 `role=red`，加入方进入后扮演 PLAYER_B

### 5.3 URL 解析与构造

```ts
// src/p2p/protocol.ts
export function parseInviteHash(hash: string): { peerId: string; role: 'A' | 'B' } | null
// hash 例：'#game?peer=abc&role=red' → { peerId: 'abc', role: 'B' }
// 缺字段、role 值非法、不是 #game 前缀 → 返回 null

export function buildInviteUrl(origin: string, peerId: string, joinerRole: 'A' | 'B'): string
// origin 例：'https://zackwonder.github.io' → 'https://zackwonder.github.io/#game?peer=...&role=...'
```

`role=red` ↔ `PLAYER_B`，`role=blue` ↔ `PLAYER_A`。

## 6. PeerJS 连接生命周期（`usePeerConnection`）

### 6.1 Hook 接口

```ts
type PeerStatus =
  | 'idle' | 'init' | 'awaiting' | 'dialing'
  | 'connected' | 'disconnected' | 'failed'

interface UsePeerConnectionResult {
  status: PeerStatus
  peerId: string | null            // 仅发起方有
  send: (msg: PeerMessage) => void
  onMessage: (handler: (msg: PeerMessage) => void) => () => void
  error: string | null
}

// 实现为两个 hook（避免一个函数承担两种生命周期）：
function useHostPeer(): UsePeerConnectionResult              // 发起方
function useJoinPeer(remotePeerId: string): UsePeerConnectionResult  // 加入方

// 二者内部共享一段 bindDataChannel 工具；对外接口完全一致，
// GameContainer 不关心是哪种，只用 transport。
```

### 6.2 发起方流程

```
new Peer()
  → on('open', id => setPeerId(id), setStatus('awaiting'))
  → on('connection', conn => bindDataChannel(conn))
  → on('error', err => setStatus('failed'), setError(err.message))
```

### 6.3 加入方流程

```
new Peer()
  → on('open', () => {
      setStatus('dialing')
      const conn = peer.connect(remotePeerId)
      conn.on('open', () => bindDataChannel(conn))
    })
  → on('error', ...同上)
```

### 6.4 bindDataChannel

```
conn.on('data', data => 反序列化 + dispatch 给已注册的 handler)
conn.on('close', () => setStatus('disconnected'))
conn.on('error', err => setStatus('disconnected'), setError(err.message))
setStatus('connected')
```

### 6.5 清理

`useEffect` cleanup 中调用 `peer.destroy()`，确保 unmount 时关闭连接、释放 broker 资源。

## 7. UI 流程

### 7.1 单机界面（无改动）

棋盘上方新增一个"🔗 P2P 对战"按钮，仅在 `history.length === 0` 时显示（避免对局中误切；包括胜负已分但还没"再玩一次"的状态，此时按钮也不显示，需先点"再玩一次"重置）。

从 P2P 模式返回单机时，棋盘统一重置为空状态（避免遗留不一致的 seq / 状态）。

### 7.2 邀请面板（`InviteModal`，发起方）

**Step 1：选阵营**
- 居中卡片，两个大按钮："我玩蓝方（先手）" / "我玩红方"
- 取消按钮 → 回 single 模式

**Step 2：复制邀请链接**
- 显示完整邀请 URL（只读 input）
- "复制链接"按钮 → `navigator.clipboard.writeText`
- 状态行："等待对方加入..." → 一旦 `status === 'connected'`，关闭 modal，进入 `p2p-active`
- 底部："取消" 按钮，回 single

### 7.3 加入方流程

**`App.tsx` 改动**：将 `window.location.hash === '#game'` 改为 `window.location.hash.startsWith('#game')`，使带邀请参数的链接也能命中游戏页。

**`Game.tsx` 启动时**：

```
const params = parseInviteHash(window.location.hash)
if (params) {
  setMode('p2p-active')
  // GameContainer 渲染时构造 transport（usePeerConnection 加入模式）
  // 同时展示一个轻量"正在连接对方..."覆盖层，直到 status === 'connected'
}
```

无 invite 参数 → 单机模式。返回单机时同步清理 URL（`history.replaceState(null,'','#game')`），避免刷新又重新加入。

### 7.4 对战中状态条（`PeerStatusBadge`，可内联到 `GameView`）

棋盘上方一行小字：
- `connected`：`P2P 对战中 | 你是蓝方 | ●（绿）对方已连接`
- `disconnected`：红字 `对方已断开` + "返回单机"按钮

## 8. 错误处理与边界

| 场景 | 处理 |
|---|---|
| PeerJS broker 连不上 | 红字"信令服务异常，请稍后重试"，按钮"返回单机" |
| 加入方打开链接，发起方已关闭 / peerId 无效 | "连接失败，请联系发起方重新分享" |
| 游戏中对方断线 | 顶部红条"对方已断开"，保留当前棋盘，提供"返回单机"按钮 |
| 第二个 joiner 打开同一链接 | PeerJS 数据通道是 1:1；第二个 `connect()` 由发起方拒绝（已绑定后忽略新 `connection` 事件），joiner 看到"对方正在与其他人对战" |
| 收到非法消息（seq 跳号 / col 越界 / 列已满 / 类型未知） | 控制台 `console.warn`，丢弃该消息，不崩溃 |
| 邀请链接 hash 格式错误（缺字段、role 不是 red/blue） | 退回单机模式，顶部黄字提示"邀请链接无效"，3 秒后消失 |
| `navigator.clipboard` 不可用 | 提示用户手动选中复制 |
| 同浏览器同时打开两个 P2P 标签 | 各自独立 Peer 实例，互不影响 |

## 9. 测试策略

### 9.1 单元测试（Vitest）

- `gameLogic.ts`：`createEmptyBoard`、`drop`、`linePoints`、`isLine4`、`applyMove` 全部分支
- `protocol.ts`：`parseInviteHash` 合法/非法输入、`buildInviteUrl` 往返一致性、消息序列化/反序列化

### 9.2 Hook 测试

- `usePeerConnection`：用 mock 的 PeerJS（拦截 `Peer` 构造）测：
  - 发起方 `init → awaiting → connected → disconnected`
  - 加入方 `init → dialing → connected → failed`
  - `send` 在 `connected` 之前调用应被缓冲或丢弃（设计选择：丢弃 + console.warn）
  - `onMessage` 多个监听器、unsubscribe 行为

### 9.3 E2E / 手测

- 主：开两个浏览器标签页跑本地 dev server，覆盖：创建 → 复制 → 粘贴 → 对战 → 一方胜 → 再玩一次 → 一方关标签 → 显示断开
- 可选 Playwright：两个 BrowserContext 模拟两端

### 9.4 覆盖率目标

`gameLogic.ts` 与 `protocol.ts` 100%；hook 80%+。

## 10. 依赖与体积

新增 1 个 npm 依赖：

```
peerjs ^1.5.x   约 50KB gzipped
```

无其他新增依赖。`docs/` 是 Vite build output，不影响 spec 存放。

## 11. 实施步骤概览（细节由 writing-plans 阶段产出）

1. 抽出 `gameLogic.ts` 与 `types.ts`，写单测
2. 拆 `GameContainer` / `GameView`，确认单机模式行为不变
3. 引入 `peerjs`，实现 `protocol.ts` + `usePeerConnection`，写单测
4. 实现 `InviteModal`，接入发起方 UX
5. 在 `Game.tsx` 加 hash 解析与加入方流程
6. 接入 `GameContainer` 的 transport 分支，启用轮次校验与悔棋屏蔽
7. 错误处理 / 状态条 / 边界场景打磨
8. 双标签 E2E 手测 + Playwright（可选）

## 12. 范围外（YAGNI）

- 不做观战模式
- 不做聊天
- 不做自动重连
- 不做自托管 STUN/TURN
- 不做反作弊
- 不持久化对战历史
- 不做计时器
