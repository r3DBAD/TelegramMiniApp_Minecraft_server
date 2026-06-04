import { RefreshCw, Server } from "lucide-react";

import type { MeResponse, ServerStatus } from "../lib/types";

type AppHeaderProps = {
  me: MeResponse | null;
  status: ServerStatus | null;
  busy: boolean;
  onRefresh: () => Promise<void>;
};

export function AppHeader({ me, status, busy, onRefresh }: AppHeaderProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">SwagaServer</p>
        <h1>Minecraft Panel</h1>
        <div className="identity-line">
          <span>{me?.user.minecraftUsername || "Ник не привязан"}</span>
          <span>{me?.roles.join(" / ") || "без роли"}</span>
        </div>
      </div>
      <div className="top-actions">
        <span className={status?.online ? "server-pill online" : "server-pill offline"}>
          <Server size={16} />
          {status?.online ? "Сервер online" : "Статус неизвестен"}
        </span>
        <button className="icon-button" onClick={onRefresh} disabled={busy} title="Обновить">
          <RefreshCw size={19} />
        </button>
      </div>
    </header>
  );
}
