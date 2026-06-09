import { CheckCircle2, CloudSun, Gamepad2, Save, Server, Shield, Sun, UserRound, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../lib/api";
import { sameMinecraftName } from "../lib/panel";
import type { CommandDef, MeResponse, ServerStatus } from "../lib/types";

type OverviewPanelProps = {
  me: MeResponse | null;
  status: ServerStatus | null;
  commands: CommandDef[];
  output: string;
  onOutput: (text: string) => void;
};

type QuickAction = {
  key: string;
  label: string;
  icon: "sun" | "weather" | "save";
  params: Record<string, string>;
};

const quickActions: QuickAction[] = [
  { key: "time.set", label: "День", icon: "sun", params: { time: "day" } },
  { key: "weather", label: "Ясно", icon: "weather", params: { weather: "clear" } },
  { key: "save-all", label: "Сохранить", icon: "save", params: {} }
];

export function OverviewPanel({ me, status, commands, output, onOutput }: OverviewPanelProps) {
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const minecraftUsername = me?.user.minecraftUsername;
  const isOnline = Boolean(
    minecraftUsername && status?.players.some((player) => sameMinecraftName(player, minecraftUsername))
  );
  const availableQuickActions = useMemo(
    () =>
      quickActions
        .map((action) => ({ ...action, command: commands.find((command) => command.key === action.key && command.allowed) }))
        .filter((action): action is QuickAction & { command: CommandDef } => Boolean(action.command)),
    [commands]
  );

  async function runQuickAction(action: QuickAction) {
    setRunningAction(action.key);
    try {
      const result = await api<{ output: string }>(`/commands/${action.key}/execute`, {
        method: "POST",
        body: JSON.stringify({ params: action.params, confirmed: true })
      });
      onOutput(result.output || "OK");
    } catch (err) {
      onOutput(err instanceof Error ? err.message : "Ошибка команды");
    } finally {
      setRunningAction(null);
    }
  }

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

      {availableQuickActions.length > 0 && (
        <div className="quick-actions">
          <div className="panel-heading">
            <h2>
              <CheckCircle2 size={18} /> Быстрые действия
            </h2>
          </div>
          <div className="quick-action-grid">
            {availableQuickActions.map((action) => (
              <button key={action.key} disabled={runningAction === action.key} onClick={() => runQuickAction(action)}>
                {action.icon === "sun" && <Sun size={18} />}
                {action.icon === "weather" && <CloudSun size={18} />}
                {action.icon === "save" && <Save size={18} />}
                <span>{runningAction === action.key ? "Выполняю..." : action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
