import { useMemo, useState } from "react";
import { buildInviteUrl, type PlayerRole } from "./protocol";
import "./InviteModal.css";

interface InviteModalProps {
  hostPeerId: string | null;
  hostStatus: "awaiting" | "connected";
  onChooseRole: (hostRole: PlayerRole) => void;
  hostRole: PlayerRole | null;
  onCancel: () => void;
}

export default function InviteModal({
  hostPeerId,
  hostStatus,
  onChooseRole,
  hostRole,
  onCancel,
}: InviteModalProps) {
  const [copied, setCopied] = useState(false);

  const inviteUrl = useMemo(() => {
    if (!hostPeerId || !hostRole) return "";
    const joinerRole: PlayerRole = hostRole === "A" ? "B" : "A";
    return buildInviteUrl(window.location.origin, hostPeerId, joinerRole);
  }, [hostPeerId, hostRole]);

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("请手动选中链接复制");
    }
  };

  if (!hostRole) {
    return (
      <div className="invite-modal-backdrop">
        <div className="invite-modal">
          <h3>选择阵营</h3>
          <div className="invite-role-row">
            <button className="invite-role invite-role-blue" onClick={() => onChooseRole("A")}>
              我玩蓝方（先手）
            </button>
            <button className="invite-role invite-role-red" onClick={() => onChooseRole("B")}>
              我玩红方
            </button>
          </div>
          <button className="invite-cancel" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-modal-backdrop">
      <div className="invite-modal">
        <h3>邀请对方加入</h3>
        <p className="invite-hint">把这条链接发给你的对手：</p>
        <input className="invite-url" readOnly value={inviteUrl || "正在连接信令服务器..."} />
        <div className="invite-actions">
          <button onClick={handleCopy} disabled={!inviteUrl}>
            {copied ? "已复制 ✓" : "复制链接"}
          </button>
        </div>
        <p className="invite-status">
          {hostStatus === "awaiting" ? "等待对方加入..." : "对方已连接，进入对战"}
        </p>
        <button className="invite-cancel" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
