import { CheckCircle2, Gamepad2, Server, Shield, UserRound, Users } from "lucide-react";

import { sameMinecraftName } from "../lib/panel";
import type { MeResponse, ServerStatus } from "../lib/types";

type OverviewPanelProps = {
  me: MeResponse | null;
  status: ServerStatus | null;
  output: string;
};

export function OverviewPanel({ me, status, output }: OverviewPanelProps) {
  const minecraftUsername = me?.user.minecraftUsername;
  const isOnline = Boolean(
    minecraftUsername && status?.players.some((player) => sameMinecraftName(player, minecraftUsername))
  );

  return (
    <section className="overview-panel">
      <div className="status-card primary-status">
        <div>
          <span>Сервер</span>
          <strong className={status?.online ? "online-text" : "offline-text"}>
            {status?.online ? "Online" : "RCON offline"}
          </strong>
        </div>
        <Server size={24} />
      </div>

      <div className="metric-grid">
        <div className="metric">
          <Users size={18} />
          <span>Игроки</span>
          <strong>
            {status?.playersOnline ?? 0}/{status?.maxPlayers ?? "?"}
          </strong>
        </div>
        <div className="metric">
          <Shield size={18} />
          <span>Роль</span>
          <strong>{me?.roles.join(", ") || "none"}</strong>
        </div>
        <div className="metric">
          <Gamepad2 size={18} />
          <span>Minecraft ник</span>
          <strong>{minecraftUsername || "Не привязан"}</strong>
        </div>
        <div className="metric">
          <UserRound size={18} />
          <span>Твой статус</span>
          <strong className={isOnline ? "online-text" : "offline-text"}>{isOnline ? "Online" : "Offline"}</strong>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>
            <Users size={18} /> Онлайн
          </h2>
          <span>{status?.players.length || 0}</span>
        </div>
        {status?.error && <p className="panel-error">RCON: {status.error}</p>}
        <div className="chips">
          {(status?.players || []).map((player) => (
            <span key={player}>{player}</span>
          ))}
          {status?.players.length === 0 && <span>Пусто</span>}
        </div>
      </div>
      {output && (
        <div className="panel">
          <div className="panel-heading">
            <h2>
              <CheckCircle2 size={18} /> Ответ сервера
            </h2>
          </div>
          <pre>{output}</pre>
        </div>
      )}
    </section>
  );
}
