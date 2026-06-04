import { CheckCircle2, Users } from "lucide-react";

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
    <section className="grid">
      <div className="metric">
        <span>Сервер</span>
        <strong className={status?.online ? "online-text" : "offline-text"}>
          {status?.online ? "Online" : "RCON offline"}
        </strong>
      </div>
      <div className="metric">
        <span>Игроки онлайн</span>
        <strong>
          {status?.playersOnline ?? 0}/{status?.maxPlayers ?? "?"}
        </strong>
      </div>
      <div className="metric">
        <span>Роль</span>
        <strong>{me?.roles.join(", ") || "none"}</strong>
      </div>
      <div className="metric">
        <span>Minecraft ник</span>
        <strong>{minecraftUsername || "Не привязан"}</strong>
      </div>
      <div className="metric">
        <span>Твой статус</span>
        <strong className={isOnline ? "online-text" : "offline-text"}>{isOnline ? "Online" : "Offline"}</strong>
      </div>
      <div className="panel wide">
        <h2>
          <Users size={18} /> Онлайн
        </h2>
        {status?.error && <p className="panel-error">RCON: {status.error}</p>}
        <div className="chips">
          {(status?.players || []).map((player) => (
            <span key={player}>{player}</span>
          ))}
          {status?.players.length === 0 && <span>Пусто</span>}
        </div>
      </div>
      {output && (
        <div className="panel wide">
          <h2>
            <CheckCircle2 size={18} /> Ответ сервера
          </h2>
          <pre>{output}</pre>
        </div>
      )}
    </section>
  );
}
