# 四子棋 P2P 手动信令兜底方案设计

**日期：** 2026-05-13
**作者：** zack
**状态：** 已批准，待实施
**关联 spec：** `specs/2026-05-13-p2p-mode-design.md`（broker 主路径）

## 1. 背景与目标

当前 P2P 模式依赖 PeerJS 公共 broker (`0.peerjs.com`) 做信令。一旦该服务宕机或访问受限（公司防火墙、地区屏蔽），整个 P2P 功能不可用。

增加**手动信令兜底**模式：邀请方与被邀请方通过聊天工具人工交换两次文本（offer 链接 + answer 文本），无需任何信令服务器即可完成 WebRTC 握手并进入对战。

**触发方式**：
- **自动**：broker 8 秒内无 peerId 或抛 error → 提示"切到手动模式"
- **手动**：InviteModal 永远提供"切到手动模式"按钮供用户主动选

非目标（YAGNI）：QR 码、trickle ICE、SDP 重写、自动重试粘贴失败、历史持久化。

## 2. 核心技术决策

### 2.1 用原生 RTCPeerConnection，绕开 PeerJS

PeerJS 设计上耦合自家 broker，不适合纯手动信令。手动路径直接用浏览器原生 `RTCPeerConnection` + `RTCDataChannel`。ICE 服务器复用现有 `PEER_OPTIONS.config.iceServers`（STUN+TURN 同一套）。

### 2.2 SDP 编码：CompressionStream + URL-safe base64

原始 SDP+ICE 约 2–4KB，base64 后 3–5KB——聊天软件能贴但视觉吓人。用浏览器原生 `CompressionStream('gzip')` 压缩 + URL-safe base64：

- 无新增 npm 依赖（modern Chrome/Safari/Firefox 都支持原生 API）
- SDP 文本压 3–5 倍 → 编码后约 ~1KB
- URL-safe base64（`+`→`-`，`/`→`_`，去 `=` padding）保证不被 URL 编码或聊天软件截断

### 2.3 ICE 策略：非 trickle，等待 gathering 完成

手动信令必须一次性把完整 SDP+候选打包成字符串。等待 `pc.icegatheringstate === 'complete'` 再 encode。最长允许 30 秒，超时则用已有候选（至少有 host 候选可用）。

### 2.4 信令对称性：offer 走 URL，answer 走纯文本

- 邀请方 → 被邀请方：链接 `https://.../#game?manual-offer=<base64>&role=<red|blue>`
- 被邀请方 → 邀请方：一段纯 base64 文本（粘贴回邀请方 textarea）

UX 与 broker 模式 offer 端一致；answer 端只需复制一段文本。

## 3. 架构

### 3.1 文件结构

```
src/p2p/
├── protocol.ts                  (现有，不动)
├── usePeerConnection.ts         (现有 broker hook，不动)
├── manualSignaling.ts           NEW：纯函数（gzip+base64 编解码、URL 协议）
├── useManualHostPeer.ts         NEW：原生 RTCPeerConnection（offer 侧）
├── useManualJoinPeer.ts         NEW：原生 RTCPeerConnection（answer 侧）
├── InviteModal.tsx              扩展：增加 manual sub-mode
└── InviteModal.css              扩展：manual 区样式
src/Game.tsx                      扩展：HostFlow 超时 fallback + 手动按钮；JoinerFlow 识别 manual-offer hash
```

### 3.2 Mode 状态机（HostFlow 内部）

```
broker-init ──超时 8s / 用户点"切到手动"──▶ manual-generating
broker-init ──对方连上──▶ broker-connected (现状路径)
manual-generating ──ICE gathered──▶ manual-share-offer
manual-share-offer ──粘贴 answer──▶ manual-applying-answer
manual-applying-answer ──RTC dc.onopen──▶ manual-connected (game)
```

### 3.3 Mode 状态机（JoinerFlow 入口分支）

```
window.location.hash 入口判断：
  #game?peer=…&role=…           ─▶ broker JoinerFlow (现状)
  #game?manual-offer=…&role=…   ─▶ ManualJoinerFlow (NEW)
  其他                            ─▶ single mode
```

`ManualJoinerFlow` 状态机：
```
parsing-offer → gathering-ice → answer-ready (展示文本) → connected (RTC open) → game
```

## 4. `manualSignaling.ts` —— 纯函数与协议

```ts
import type { PlayerRole } from "./protocol";

// 压缩 + URL-safe base64
export async function compressBase64(text: string): Promise<string>;
export async function decompressBase64(data: string): Promise<string>;

// SDP 序列化（offer/answer 都是 RTCSessionDescriptionInit）
export async function encodeSDP(desc: RTCSessionDescriptionInit): Promise<string>;
export async function decodeSDP(encoded: string): Promise<RTCSessionDescriptionInit>;

// URL 协议
export function buildManualInviteUrl(
  origin: string,
  encodedOffer: string,
  joinerRole: PlayerRole
): string;
// → https://.../#game?manual-offer=<urlsafe-base64>&role=<red|blue>

export function parseManualInviteHash(
  hash: string
): { encodedOffer: string; role: PlayerRole } | null;
```

**实现要点：**
```ts
async function compressBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function decompressBase64(data: string): Promise<string> {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}
```

**SDP 编码**：`encodeSDP({ type, sdp })` 把 `RTCSessionDescriptionInit` JSON 序列化后压缩+base64。decode 反之。

**parseManualInviteHash**：复用现有 `parseInviteHash` 的解析骨架（`#game` 前缀 + `?` 后查询串），但识别 `manual-offer` 而非 `peer` 字段；role 字段含义不变（`red` ↔ B，`blue` ↔ A）。

## 5. `useManualHostPeer.ts`

### 5.1 接口

```ts
export type ManualHostStatus =
  | "init"
  | "gathering"
  | "awaiting-answer"
  | "applying-answer"
  | "connected"
  | "disconnected"
  | "failed";

export interface UseManualHostPeerResult {
  status: ManualHostStatus;
  error: string | null;
  manualOffer: string | null;  // ICE 完成后填充
  acceptAnswer: (encodedAnswer: string) => Promise<void>;
  send: (msg: PeerMessage) => void;
  onMessage: (handler: (msg: PeerMessage) => void) => () => void;
}

export function useManualHostPeer(): UseManualHostPeerResult;
```

注意：hook 内部不需要知道 `joinerRole`（角色仅与 URL 构造相关）。调用方拿到 `manualOffer` 后自行调用 `buildManualInviteUrl(origin, manualOffer, joinerRole)` 拼成完整邀请 URL。

### 5.2 生命周期（useEffect 内）

```ts
useEffect(() => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pcRef.current = pc;
  const dc = pc.createDataChannel("game");
  bindDataChannel(dc);  // dc.onopen → setStatus('connected')；dc.onmessage → dispatch

  setStatus("gathering");
  pc.createOffer()
    .then(offer => pc.setLocalDescription(offer))
    .catch(handleError);

  pc.onicegatheringstatechange = () => {
    if (pc.iceGatheringState === "complete") {
      encodeSDP(pc.localDescription!)
        .then(encoded => { setManualOffer(encoded); setStatus("awaiting-answer"); })
        .catch(handleError);
    }
  };

  // 兜底超时 30s
  const t = setTimeout(() => {
    if (pc.iceGatheringState !== "complete" && pc.localDescription) {
      encodeSDP(pc.localDescription)
        .then(encoded => { setManualOffer(encoded); setStatus("awaiting-answer"); });
    }
  }, 30_000);

  return () => { clearTimeout(t); pc.close(); pcRef.current = null; };
}, []);

const acceptAnswer = useCallback(async (encoded: string) => {
  setStatus("applying-answer");
  try {
    const answer = await decodeSDP(encoded);
    await pcRef.current!.setRemoteDescription(answer);
  } catch (e) {
    setError("答复格式无效");
    setStatus("awaiting-answer");
  }
}, []);
```

### 5.3 send / onMessage

实现与 broker hook 同 pattern：listenersRef + dc.send。`send` 在 `dc.readyState !== 'open'` 时打印警告丢弃。

## 6. `useManualJoinPeer.ts`

### 6.1 接口

```ts
export type ManualJoinStatus =
  | "init"
  | "parsing"
  | "gathering"
  | "answer-ready"
  | "connected"
  | "disconnected"
  | "failed";

export interface UseManualJoinPeerResult {
  status: ManualJoinStatus;
  error: string | null;
  manualAnswer: string | null;  // ICE 完成后填充
  send / onMessage 同 broker 接口
}

export function useManualJoinPeer(encodedOffer: string): UseManualJoinPeerResult;
```

### 6.2 生命周期

```ts
useEffect(() => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pcRef.current = pc;

  pc.ondatachannel = (ev) => bindDataChannel(ev.channel);
  setStatus("parsing");

  decodeSDP(encodedOffer)
    .then(offer => pc.setRemoteDescription(offer))
    .then(() => pc.createAnswer())
    .then(answer => pc.setLocalDescription(answer))
    .then(() => setStatus("gathering"))
    .catch(handleError);

  pc.onicegatheringstatechange = () => {
    if (pc.iceGatheringState === "complete") {
      encodeSDP(pc.localDescription!)
        .then(encoded => { setManualAnswer(encoded); setStatus("answer-ready"); });
    }
  };

  // 30s 兜底同 host
  return () => pc.close();
}, [encodedOffer]);
```

## 7. UI 扩展：`InviteModal`

### 7.1 新增 props

```ts
interface InviteModalProps {
  // 现有
  hostPeerId: string | null;
  hostStatus: "awaiting" | "connected";
  hostRole: PlayerRole | null;
  onChooseRole: (r: PlayerRole) => void;
  onCancel: () => void;
  // 新增：手动模式
  brokerTimedOut: boolean;
  onSwitchToManual: () => void;
  manualMode: boolean;
  manualOffer: string | null;
  manualOfferStatus: "gathering" | "ready" | "applying-answer" | null;
  manualAnswerInput: string;
  onManualAnswerInputChange: (v: string) => void;
  onSubmitManualAnswer: () => void;
  manualError: string | null;
}
```

### 7.2 视觉布局变化

**Step 2 (broker 模式)** 在原来的"等待对方加入..."下方新增一行小字：

```
broker 无响应？[切到手动模式]    （灰色文字 + 链接按钮）
```

`brokerTimedOut === true` 时把这行升级成黄色背景警示条 + 按钮主色：

```
⚠️ 信令服务无响应（8s 超时） → [切到手动模式]
```

**Step 3 (manual 模式)** 整块替换 broker UI：

```
🛠 手动模式
─────────────────────────────────
Step 1: 把这条链接发给对方

[只读 input：长 URL]   [复制]

状态：正在收集网络候选...  (gathering)
状态：等待对方回复       (ready)
状态：正在应用答复...    (applying-answer)

─────────────────────────────────
Step 2: 对方回复后，把答复贴到这里

[多行 textarea，3-4 行高]

[应用 answer 按钮]    （manualOfferStatus === 'ready' 才启用）

manualError !== null 时下方红字显示错误
─────────────────────────────────
[取消] / [切回 broker 模式]
```

### 7.3 CSS 新增类

```css
.manual-section { margin-top: 1rem; text-align: left; }
.manual-step { margin-bottom: 0.8rem; }
.manual-step-label { font-size: 0.85rem; opacity: 0.8; }
.manual-answer-input { width: 100%; min-height: 5em; font-family: monospace; ... }
.manual-error { color: #e57373; font-size: 0.85rem; margin-top: 0.25rem; }
.broker-fallback-hint { font-size: 0.8rem; opacity: 0.7; margin-top: 0.5rem; }
.broker-fallback-hint.warning { background: rgba(255,193,7,0.18); color: #ffc107; padding: 6px 10px; border-radius: 6px; opacity: 1; }
```

## 8. UI 扩展：`Game.tsx`

### 8.1 `HostFlow` 扩展

新增 hook：
```ts
function HostFlow({ onLeave }: { onLeave: () => void }) {
  const [signalingMode, setSignalingMode] = useState<"broker" | "manual">("broker");
  const [hostRole, setHostRole] = useState<PlayerRole | null>(null);

  // broker 路径
  const broker = useHostPeer();
  // manual 路径（仅当 manualMode 时启用——但 hook 不支持有条件调用）
  // 解法：始终调用，但 broker 模式下其 RTCPeerConnection 不实际工作
  // 更干净的解法：把 HostFlow 拆成 BrokerHostFlow / ManualHostFlow 两个组件，
  // 父组件 HostFlow 根据 signalingMode 渲染其中之一（避免无条件多余 RTCPeerConnection 占资源）
  ...
}
```

**实施选择**：拆 `BrokerHostFlow` 和 `ManualHostFlow` 两个子组件，`HostFlow` 是切换 wrapper。切换时旧组件 unmount → 释放旧 peer/RTCPeerConnection，新组件 mount。

### 8.2 broker 超时检测

`BrokerHostFlow` 内增加：
```ts
const [brokerTimedOut, setBrokerTimedOut] = useState(false);
useEffect(() => {
  if (broker.status === "init") {
    const t = setTimeout(() => setBrokerTimedOut(true), 8_000);
    return () => clearTimeout(t);
  }
}, [broker.status]);
useEffect(() => {
  if (broker.status === "failed") setBrokerTimedOut(true);
}, [broker.status]);
```

### 8.3 `ManualHostFlow` 组件

**流程**：进入 `ManualHostFlow` 前用户已在 `InviteModal` 选好阵营（hostRole 通过 props 传入，不在 Manual 流程内重选）。Manual hook 不依赖 role。

```tsx
interface ManualHostFlowProps {
  hostRole: PlayerRole;       // 父组件已确定的阵营
  onLeave: () => void;
  onBackToBroker: () => void;
}

function ManualHostFlow({ hostRole, onLeave, onBackToBroker }: ManualHostFlowProps) {
  const host = useManualHostPeer();
  const transport = useMemo<GameContainerTransport | undefined>(() => {
    if (host.status !== "connected") return undefined;
    return { send: host.send, onMessage: host.onMessage, localRole: hostRole };
  }, [host.status, host.send, host.onMessage, hostRole]);
  // 复用现有 InviteModal（manualMode=true 分支）作为 Step 1+2 UI
  // 一旦 transport 出现，渲染 GameContainer + ConnectionBanner（同 broker 路径）
  ...
}
```

注意：现有 `useTransport(peer, role)` 仅识别 `UsePeerConnectionResult` 的 `status === 'connected'`；Manual 模式直接用上方的内联 `useMemo` 即可，**不复用** `useTransport` 函数——两条路径各自管理 transport 构造，避免侵入 broker 类型。

### 8.4 `ManualJoinerFlow` 组件

`Game.tsx` 入口判断：
```ts
const manualParams = parseManualInviteHash(window.location.hash);
if (manualParams) {
  return <ManualJoinerFlow encodedOffer={manualParams.encodedOffer} role={manualParams.role} onLeave={...} />;
}
```

`ManualJoinerFlow` 渲染：
- `status === 'parsing' | 'gathering'`：spinner + 提示文字
- `status === 'answer-ready'`：大文本区显示 `manualAnswer` + 复制按钮 + "对方收到后会自动建立连接"
- `status === 'connected'`：进入 GameContainer（与 broker JoinerFlow 同模板）
- `status === 'failed'`：失败页 + 返回单机

### 8.5 入口按钮（手动加入测试用）

不暴露在 UI——`ManualJoinerFlow` 是由 URL hash 自动触发，无需手动入口。

## 9. 数据流（manual 模式）

### 9.1 落子 / reset / 断线

完全沿用 `GameContainer` 的现有 `transport` 接口。`useManualHostPeer / useManualJoinPeer` 暴露与 broker hook 同形的 `send / onMessage`，`GameContainer` 不需要任何改动。

### 9.2 DataChannel.onmessage

`bindDataChannel` 的 onmessage 与现有 `bindConnection` (peerjs) 一致：
- 反序列化 → `isPeerMessage` 校验 → 派发到 listenersRef
- 非法消息 console.warn 丢弃

### 9.3 send

`dc.send(JSON.stringify(msg))`。注意：`RTCDataChannel.send` 接受 string，不是 object——这里与 peerjs 不同，peerjs 内部自动序列化，原生 dc 需要我们手动 stringify。`onmessage` 收到 `MessageEvent.data` 是 string，要 `JSON.parse` 后再 `isPeerMessage` 校验。

## 10. 错误处理与边界

| 场景 | 处理 |
|---|---|
| broker 8s 没响应 | InviteModal 弹"切到手动模式"建议（黄色高亮） |
| broker peer.on('error') | 同上 + 写入 brokerTimedOut |
| 用户主动点"切到手动" | BrokerHostFlow unmount（peer.destroy）→ 切到 ManualHostFlow |
| 用户在手动模式点"切回 broker" | ManualHostFlow unmount（pc.close）→ 切回 BrokerHostFlow，重新走 broker 路径 |
| ICE gathering > 30s | 用已有候选 encode（至少 host candidate）；状态进 `awaiting-answer` |
| 粘贴 answer base64 无效 | decode 抛错 → 显示 `manualError` "答复格式无效，请检查复制是否完整" |
| 粘贴 answer SDP 解析失败 | `setRemoteDescription` 抛错 → 同上 |
| DataChannel.onerror | status → 'disconnected'，banner 变红 |
| DataChannel.onclose | 同上 |
| 邀请链接 hash 解析失败 | 退回单机模式 + toast "邀请链接无效" |
| 浏览器不支持 CompressionStream | encode/decode 抛错 → 显示 "您的浏览器不支持手动模式，请升级浏览器" |

## 11. 测试策略

### 11.1 单测（Vitest）

- `manualSignaling.test.ts`：
  - `compressBase64 / decompressBase64` 往返一致
  - URL-safe 输出（无 `+`, `/`, `=`）
  - 字符串大小压缩比合理（典型 SDP 压 3x+）
  - `encodeSDP / decodeSDP` 往返一致（输入 `{ type: "offer", sdp: "..." }`）
  - `buildManualInviteUrl + parseManualInviteHash` 往返
  - 解析非法 hash → null

### 11.2 Hook 测试

- `useManualHostPeer.test.tsx`：
  - mock 全局 `RTCPeerConnection`（vi.stubGlobal）：包含 createOffer / setLocalDescription / iceGatheringState / createDataChannel
  - 状态机：init → gathering → awaiting-answer → applying-answer → connected
  - `acceptAnswer` 无效输入 → `error` 非空，状态不进 applying
- `useManualJoinPeer.test.tsx`：
  - 类似 mock：包含 ondatachannel / setRemoteDescription / createAnswer
  - 状态机：parsing → gathering → answer-ready → connected
  - decodeSDP 失败 → status='failed'

### 11.3 E2E / 手测

- 主：两标签开本地 dev server，覆盖：
  1. 自动 fallback：mock broker 不可达（如断网） → 8s 后 InviteModal 提示
  2. 手动切换：broker 连上之前点"切到手动模式"
  3. 完整手动握手：复制链接 → 粘贴 → 拿 answer → 复制 → 粘贴 answer → 进入对战
  4. 落子同步、再玩一次、断线提示（沿用现有用例）
- 可选 Playwright：两个 BrowserContext 模拟两端，复制粘贴用 `page.evaluate` 桥接

## 12. 实施步骤（writing-plans 阶段会细化）

1. `manualSignaling.ts` + 单测
2. `useManualHostPeer` + mock 单测
3. `useManualJoinPeer` + mock 单测
4. `InviteModal` 扩展支持 manual sub-mode（UI 占位 + 不接 hook）
5. `Game.tsx` 拆 `HostFlow` 为 `BrokerHostFlow` + `ManualHostFlow`，加 wrapper 切换
6. `Game.tsx` 加 `ManualJoinerFlow` 路径
7. broker 8s 超时 + 手动开关接线
8. 错误处理与边界（包括 CompressionStream 不可用降级提示）
9. 两标签手测

## 13. 范围外（YAGNI）

- 不做 QR 码分享
- 不做 trickle ICE 增量交换
- 不做 SDP 重写 / 优化
- 不做答复格式错误时自动重试（用户重新粘贴即可）
- 不持久化 manual 状态（刷新即重置）
- 不在 broker 与 manual 间做"自动恢复"——切换是单向手动
- 不做答复字符串校验码 / 防篡改（朋友对战，无对抗需求）
- 不实现 ManualHostFlow 在生成 offer 期间允许"切换阵营"（须在 Step 1 选完阵营再点切到手动）

## 14. 与现有 broker spec 的关系

- 现有 `specs/2026-05-13-p2p-mode-design.md` 全部条款保持有效
- 本 spec 是其**兜底扩展**，broker 路径优先，手动路径独立模块
- `GameContainer.transport` 接口是共享契约，两条路径都必须遵守
- 加密配置 `PEER_OPTIONS.config.iceServers` 同时供 broker 与 manual 路径使用
