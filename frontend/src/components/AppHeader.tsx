import { RefreshCw, Server, Shield } from "lucide-react";

import type { MeResponse, ServerStatus } from "../lib/types";

type AppHeaderProps = {
  me: MeResponse | null;
  status: ServerStatus | null;
  busy: boolean;
  onRefresh: () => Promise<void>;
};

export function AppHeader({ me, status, busy, onRefresh }: AppHeaderProps) {
  const role = me?.roles[0] || "без роли";

  return (
    <header className="app-header">
      <div className="app-title">
        <div className="server-mark">
          <Server size={18} />
        </div>
        <div>
          <p>Community Server</p>
          <h1>Minecraft Panel</h1>
        </div>
      </div>

      <div className="header-status">
        <span className={status?.online ? "server-pill online" : "server-pill offline"}>
          <Server size={16} />
          {status?.online ? "Online" : "Offline"}
        </span>
        <button className="icon-button" onClick={onRefresh} disabled={busy} title="Обновить" aria-label="Обновить данные">
          <RefreshCw size={19} />
        </button>
      </div>

      <div className="identity-line">
        <span>{me?.user.minecraftUsername || "Ник не привязан"}</span>
        <span>
          <Shield size={14} /> {role}
        </span>
      </div>
    </header>
  );
}
