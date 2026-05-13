import { useMemo, useState } from "react";
import { buildInviteUrl, type PlayerRole } from "./protocol";
import "./InviteModal.css";

export type ManualOfferStatus = "gathering" | "ready" | "applying-answer";

interface InviteModalProps {
  hostPeerId: string | null;
  hostStatus: "awaiting" | "connected";
  hostRole: PlayerRole | null;
  onChooseRole: (hostRole: PlayerRole) => void;
  onCancel: () => void;
  // Manual fallback hooks (all optional with defaults for backward compat)
  brokerTimedOut?: boolean;
  onSwitchToManual?: () => void;
  manualMode?: boolean;
  manualOfferUrl?: string | null;
  manualOfferStatus?: ManualOfferStatus | null;
  manualAnswerInput?: string;
  onManualAnswerInputChange?: (v: string) => void;
  onSubmitManualAnswer?: () => void;
  onBackToBroker?: () => void;
  manualError?: string | null;
}

export default function InviteModal({
  hostPeerId,
  hostStatus,
  hostRole,
  onChooseRole,
  onCancel,
  brokerTimedOut = false,
  onSwitchToManual = () => {},
  manualMode = false,
  manualOfferUrl = null,
  manualOfferStatus = null,
  manualAnswerInput = "",
  onManualAnswerInputChange = () => {},
  onSubmitManualAnswer = () => {},
  onBackToBroker = () => {},
  manualError = null,
}: InviteModalProps) {
  const [copiedBroker, setCopiedBroker] = useState(false);
  const [copiedManual, setCopiedManual] = useState(false);

  const brokerInviteUrl = useMemo(() => {
    if (!hostPeerId || !hostRole) return "";
    const joinerRole: PlayerRole = hostRole === "A" ? "B" : "A";
    const route = window.location.hash.startsWith("#play") ? "#play" : "#game";
    return buildInviteUrl(window.location.origin, route, hostPeerId, joinerRole);
  }, [hostPeerId, hostRole]);

  const copyTo = async (text: string, setCopied: (b: boolean) => void) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("请手动选中复制");
    }
  };

  if (!hostRole) {
    return (
      <div className="invite-modal-backdrop">
        <div className="invite-modal">
          <h3>选择角色</h3>
          <div className="invite-role-row">
            <button
              type="button"
              className="role-pick role-pick-blue"
              onClick={() => onChooseRole("A")}
              aria-label="我玩蓝方（先手）"
            >
              <span
                className="role-pick-avatar"
                style={{ backgroundImage: "url('/tanson_0.jpg')" }}
              />
              <span className="role-pick-label">蓝方（先手）</span>
            </button>
            <button
              type="button"
              className="role-pick role-pick-red"
              onClick={() => onChooseRole("B")}
              aria-label="我玩红方"
            >
              <span
                className="role-pick-avatar"
                style={{ backgroundImage: "url('/sherly_0.jpg')" }}
              />
              <span className="role-pick-label">红方</span>
            </button>
          </div>
          <button className="invite-cancel" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    );
  }

  if (manualMode) {
    const offerReady = manualOfferUrl !== null;
    const statusText =
      manualOfferStatus === "ready"
        ? "等待对方回复"
        : manualOfferStatus === "applying-answer"
        ? "正在应用答复..."
        : "正在收集网络候选...";
    return (
      <div className="invite-modal-backdrop">
        <div className="invite-modal">
          <h3>🛠 手动模式</h3>
          {!offerReady ? (
            <div className="manual-loading">
              <div className="manual-spinner" />
              <p>正在生成邀请链接</p>
              <p className="manual-loading-hint">收集网络候选中（最多约 5 秒）...</p>
            </div>
          ) : (
            <div className="manual-section">
              <div className="manual-step">
                <div className="manual-step-label">Step 1: 把这条链接发给对方</div>
                <input className="invite-url" readOnly value={manualOfferUrl} />
                <div className="invite-actions">
                  <button onClick={() => copyTo(manualOfferUrl, setCopiedManual)}>
                    {copiedManual ? "已复制 ✓" : "复制链接"}
                  </button>
                </div>
                <p className="invite-status">状态：{statusText}</p>
              </div>
              <div className="manual-step">
                <div className="manual-step-label">Step 2: 把对方回复的答复贴到这里</div>
                <textarea
                  className="manual-answer-input"
                  value={manualAnswerInput}
                  onChange={(e) => onManualAnswerInputChange(e.target.value)}
                  placeholder="粘贴对方发回的 answer 文本"
                />
                {manualError && <div className="manual-error">{manualError}</div>}
                <div className="invite-actions">
                  <button
                    onClick={onSubmitManualAnswer}
                    disabled={!manualAnswerInput || manualOfferStatus !== "ready"}
                  >
                    应用 answer
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="invite-bottom-row">
            <button className="invite-cancel" onClick={onBackToBroker}>
              切回 broker 模式
            </button>
            <button className="invite-cancel" onClick={onCancel}>
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-modal-backdrop">
      <div className="invite-modal">
        <h3>邀请对方加入</h3>
        <p className="invite-hint">把这条链接发给你的对手：</p>
        <input
          className="invite-url"
          readOnly
          value={brokerInviteUrl || "正在连接信令服务器..."}
        />
        <div className="invite-actions">
          <button onClick={() => copyTo(brokerInviteUrl, setCopiedBroker)} disabled={!brokerInviteUrl}>
            {copiedBroker ? "已复制 ✓" : "复制链接"}
          </button>
        </div>
        <p className="invite-status">
          {hostStatus === "awaiting" ? "等待对方加入..." : "对方已连接，进入对战"}
        </p>
        <div className={`broker-fallback-hint ${brokerTimedOut ? "warning" : ""}`}>
          {brokerTimedOut ? "⚠️ 信令服务无响应 — " : "broker 无响应？"}
          <button className="link-button" onClick={onSwitchToManual}>
            切到手动模式
          </button>
        </div>
        <button className="invite-cancel" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
