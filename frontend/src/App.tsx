import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Command,
  Crown,
  Gamepad2,
  Link,
  RefreshCw,
  Server,
  Shield,
  UserCog,
  Users,
  Wifi,
  WifiOff,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, hasTelegramInitData } from "./lib/api";
import type { CommandDef, MeResponse, PermissionDef, ServerStatus, UserListItem } from "./lib/types";

type Tab = "overview" | "commands" | "users";

const riskLabels: Record<CommandDef["riskLevel"], string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический"
};

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [commands, setCommands] = useState<CommandDef[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionDef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");

  const can = useMemo(() => new Set(me?.permissions || []), [me]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const profile = await api<MeResponse>("/auth/me");
      setMe(profile);
      if (profile.user.status === "active") {
        const [serverStatus, commandCatalog] = await Promise.all([
          api<ServerStatus>("/server/status"),
          api<{ commands: CommandDef[] }>("/commands")
        ]);
        setStatus(serverStatus);
        setCommands(commandCatalog.commands);
        if (profile.permissions.includes("users.manage")) {
          const userList = await api<{ users: UserListItem[] }>("/users");
          setUsers(userList.users);
        }
        if (profile.permissions.includes("roles.manage")) {
          const catalog = await api<{ permissions: PermissionDef[] }>("/users/permissions/catalog");
          setPermissionCatalog(catalog.permissions);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (!hasTelegramInitData()) {
    return (
      <main className="shell centered">
        <section className="empty-state">
          <Shield size={42} />
          <h1>Minecraft Panel</h1>
          <p>Открой панель из Telegram-бота.</p>
        </section>
      </main>
    );
  }

  if (me?.user.status === "pending") {
    return (
      <main className="shell centered">
        <section className="empty-state">
          <UserCog size={42} />
          <h1>Доступ ожидает подтверждения</h1>
          <p>ID: {me.user.telegramUserId}</p>
          <AccessRequestForm />
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
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
          <button className="icon-button" onClick={load} disabled={busy} title="Обновить">
            <RefreshCw size={19} />
          </button>
        </div>
      </header>

      {error && <div className="notice danger">{error}</div>}

      <nav className="tabs">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
          <Activity size={17} /> Обзор
        </button>
        <button className={tab === "commands" ? "active" : ""} onClick={() => setTab("commands")}>
          <Command size={17} /> Команды
        </button>
        {can.has("users.manage") && (
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            <UserCog size={17} /> Настройки
          </button>
        )}
      </nav>

      {tab === "overview" && (
        <Overview me={me} status={status} output={output} />
      )}

      {tab === "commands" && (
        <Commands commands={commands} onlinePlayers={status?.players || []} onOutput={setOutput} />
      )}

      {tab === "users" && can.has("users.manage") && (
        <UsersPage
          users={users}
          permissions={permissionCatalog}
          canManageRoles={can.has("roles.manage")}
          onlinePlayers={status?.players || []}
          reload={load}
        />
      )}
    </main>
  );
}

function Overview({ me, status, output }: { me: MeResponse | null; status: ServerStatus | null; output: string }) {
  const minecraftUsername = me?.user.minecraftUsername;
  const isOnline = Boolean(
    minecraftUsername &&
      status?.players.some((player) => sameMinecraftName(player, minecraftUsername))
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
        <strong>{status?.playersOnline ?? 0}/{status?.maxPlayers ?? "?"}</strong>
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
        <strong className={isOnline ? "online-text" : "offline-text"}>
          {isOnline ? "Online" : "Offline"}
        </strong>
      </div>
      <div className="panel wide">
        <h2><Users size={18} /> Онлайн</h2>
        {status?.error && <p className="panel-error">RCON: {status.error}</p>}
        <div className="chips">
          {(status?.players || []).map((player) => <span key={player}>{player}</span>)}
          {status?.players.length === 0 && <span>Пусто</span>}
        </div>
      </div>
      {output && (
        <div className="panel wide">
          <h2><CheckCircle2 size={18} /> Ответ сервера</h2>
          <pre>{output}</pre>
        </div>
      )}
    </section>
  );
}

function AccessRequestForm() {
  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    if (!minecraftUsername.trim()) return;
    await api("/auth/access-request", {
      method: "POST",
      body: JSON.stringify({ minecraft_username: minecraftUsername.trim() })
    });
    setMessage("Ник отправлен владельцу на подтверждение.");
  }

  return (
    <div className="access-form">
      <input
        value={minecraftUsername}
        placeholder="Minecraft ник"
        onChange={(event) => setMinecraftUsername(event.target.value)}
      />
      <button onClick={submit}><Link size={16} /> Отправить ник</button>
      {message && <p>{message}</p>}
    </div>
  );
}

function Commands({
  commands,
  onlinePlayers,
  onOutput
}: {
  commands: CommandDef[];
  onlinePlayers: string[];
  onOutput: (text: string) => void;
}) {
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [running, setRunning] = useState<string | null>(null);
  const available = commands.filter((command) => command.allowed).length;

  async function execute(command: CommandDef) {
    if (!command.allowed) return;
    if (command.confirmationRequired && !confirm(`${command.title}?`)) return;
    const params = buildCommandParams(command, values[command.key] || {}, onlinePlayers);
    setRunning(command.key);
    try {
      const result = await api<{ output: string }>(`/commands/${command.key}/execute`, {
        method: "POST",
        body: JSON.stringify({ params, confirmed: true })
      });
      onOutput(result.output || "OK");
    } catch (err) {
      onOutput(err instanceof Error ? err.message : "Ошибка команды");
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="command-list">
      <div className="section-head">
        <div>
          <p className="eyebrow">RCON allowlist</p>
          <h2><Command size={18} /> Команды</h2>
        </div>
        <span>{available}/{commands.length} доступно</span>
      </div>
      {commands.map((command) => {
        const fieldCount = Object.entries(command.paramsSchema).filter(([, param]) => param.type !== "own_minecraft_username").length;

        return (
          <article className={`command-row risk-${command.riskLevel} ${!command.allowed ? "locked" : ""}`} key={command.key}>
            <div className="command-main">
              <div className="command-title">
                <h2>{command.title}</h2>
                <span className={`risk-badge ${command.riskLevel}`}>
                  {command.riskLevel === "critical" && <AlertTriangle size={14} />}
                  {riskLabels[command.riskLevel]}
                </span>
              </div>
              <p>{command.description || command.permissionKey}</p>
            </div>
            <div className={fieldCount > 0 ? "command-fields" : "command-fields empty"}>
              {Object.entries(command.paramsSchema).map(([name, param]) => {
                if (param.type === "own_minecraft_username") return null;
                if (param.type === "minecraft_username" && onlinePlayers.length > 0) {
                  return (
                    <select
                      key={name}
                      aria-label={name}
                      value={values[command.key]?.[name] || onlinePlayers[0]}
                      onChange={(event) => setCommandValue(setValues, command.key, name, event.target.value)}
                    >
                      {onlinePlayers.map((player) => (
                        <option key={player} value={player}>{name}: {player}</option>
                      ))}
                    </select>
                  );
                }
                if (param.type === "enum") {
                  return (
                    <select
                      key={name}
                      aria-label={name}
                      value={values[command.key]?.[name] || param.default || param.values[0]}
                      onChange={(event) => setCommandValue(setValues, command.key, name, event.target.value)}
                    >
                      {param.values.map((value) => <option key={value}>{value}</option>)}
                    </select>
                  );
                }
                return (
                  <input
                    key={name}
                    aria-label={name}
                    placeholder={name}
                    defaultValue={"default" in param ? param.default : ""}
                    onChange={(event) => setCommandValue(setValues, command.key, name, event.target.value)}
                  />
                );
              })}
              {fieldCount === 0 && <span>Параметры не нужны</span>}
              {fieldCount > 0 && onlinePlayers.length === 0 && command.key.startsWith("tp.") && (
                <span>Нет игроков онлайн</span>
              )}
            </div>
            <button
              className="run-button"
              disabled={!command.allowed || running === command.key}
              onClick={() => execute(command)}
            >
              {running === command.key ? "..." : command.allowed ? "Выполнить" : "Нет доступа"}
            </button>
          </article>
        );
      })}
    </section>
  );
}

function UsersPage({
  users,
  permissions,
  canManageRoles,
  onlinePlayers,
  reload
}: {
  users: UserListItem[];
  permissions: PermissionDef[];
  canManageRoles: boolean;
  onlinePlayers: string[];
  reload: () => Promise<void>;
}) {
  const [selectedPermission, setSelectedPermission] = useState<Record<number, string>>({});
  const [minecraftNames, setMinecraftNames] = useState<Record<number, string>>({});
  const [selectedUserId, setSelectedUserId] = useState<number | null>(users[0]?.id ?? null);
  const commandPermissions = permissions.filter((permission) => permission.category === "command");
  const selectedUser = users.find((user) => user.id === selectedUserId) || users[0];
  const pendingCount = users.filter((user) => user.status === "pending").length;

  async function setStatus(user: UserListItem, status: string) {
    await api(`/users/${user.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await reload();
  }

  async function grantRole(user: UserListItem, roleKey: string) {
    await api(`/users/${user.id}/roles`, {
      method: "POST",
      body: JSON.stringify({ roleKey })
    });
    await reload();
  }

  async function setPermission(user: UserListItem, effect: "allow" | "deny") {
    const permissionKey = selectedPermission[user.id];
    if (!permissionKey) return;
    await api(`/users/${user.id}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissionKey, effect, reason: "Mini App override" })
    });
    await reload();
  }

  async function setMinecraftProfile(user: UserListItem) {
    const username = (
      minecraftNames[user.id] ||
      user.minecraft_username ||
      user.requested_minecraft_username ||
      ""
    ).trim();
    if (!username) return;
    await api(`/users/${user.id}/minecraft-profile`, {
      method: "PUT",
      body: JSON.stringify({ username })
    });
    await reload();
  }

  return (
    <section className="user-list">
      <div className="section-head">
        <div>
          <p className="eyebrow">Access control</p>
          <h2><UserCog size={18} /> Настройки доступа</h2>
        </div>
        <span>{users.length} всего · {pendingCount} заявок</span>
      </div>
      <div className="settings-panel">
        <label className="field-label">
          Пользователь
          <select
            value={selectedUser?.id || ""}
            onChange={(event) => setSelectedUserId(Number(event.target.value))}
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {userLabel(user)} · {statusLabel(user.status)}
              </option>
            ))}
          </select>
        </label>

        {selectedUser ? (
          <SelectedUserSettings
            user={selectedUser}
            commandPermissions={commandPermissions}
            canManageRoles={canManageRoles}
            onlinePlayers={onlinePlayers}
            minecraftName={minecraftNames[selectedUser.id] ?? selectedUser.minecraft_username ?? selectedUser.requested_minecraft_username ?? ""}
            selectedPermission={selectedPermission[selectedUser.id] || ""}
            setMinecraftName={(value) => setMinecraftNames((current) => ({ ...current, [selectedUser.id]: value }))}
            setSelectedPermission={(value) => setSelectedPermission((current) => ({ ...current, [selectedUser.id]: value }))}
            setStatus={setStatus}
            grantRole={grantRole}
            setPermission={setPermission}
            setMinecraftProfile={setMinecraftProfile}
          />
        ) : (
          <div className="notice">Пользователей пока нет.</div>
        )}
      </div>
    </section>
  );
}

function SelectedUserSettings({
  user,
  commandPermissions,
  canManageRoles,
  onlinePlayers,
  minecraftName,
  selectedPermission,
  setMinecraftName,
  setSelectedPermission,
  setStatus,
  grantRole,
  setPermission,
  setMinecraftProfile
}: {
  user: UserListItem;
  commandPermissions: PermissionDef[];
  canManageRoles: boolean;
  onlinePlayers: string[];
  minecraftName: string;
  selectedPermission: string;
  setMinecraftName: (value: string) => void;
  setSelectedPermission: (value: string) => void;
  setStatus: (user: UserListItem, status: string) => Promise<void>;
  grantRole: (user: UserListItem, roleKey: string) => Promise<void>;
  setPermission: (user: UserListItem, effect: "allow" | "deny") => Promise<void>;
  setMinecraftProfile: (user: UserListItem) => Promise<void>;
}) {
  const isOnline = Boolean(
    user.minecraft_username &&
      onlinePlayers.some((player) => sameMinecraftName(player, user.minecraft_username!))
  );

  return (
    <article className="settings-card">
      <div className="settings-summary">
        <div>
          <p className="eyebrow">Selected user</p>
          <h2>{userLabel(user)}</h2>
          <p>{statusLabel(user.status)} · {user.roles.join(", ") || "no role"}</p>
        </div>
        <div className="user-meta">
          <span><Gamepad2 size={15} /> {user.minecraft_username || user.requested_minecraft_username || "Ник не привязан"}</span>
          <span className={isOnline ? "status-pill online" : "status-pill offline"}>
            {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      <div className="settings-grid">
        <label className="field-label wide-field">
          Minecraft ник
          <div className="profile-link">
            <input
              value={minecraftName}
              placeholder="Minecraft ник"
              onChange={(event) => setMinecraftName(event.target.value)}
            />
            <button onClick={() => setMinecraftProfile(user)}><Link size={16} /> Привязать</button>
          </div>
        </label>

        <div className="settings-actions">
          <button onClick={() => setStatus(user, "active")}><CheckCircle2 size={16} /> Активировать</button>
          <button className="danger-button" onClick={() => setStatus(user, "blocked")}><XCircle size={16} /> Отклонить</button>
        </div>

        {canManageRoles && (
          <>
            <div className="settings-actions wide-field">
              <button onClick={() => grantRole(user, "player")}><Shield size={16} /> Player</button>
              <button onClick={() => grantRole(user, "moderator")}><Ban size={16} /> Moderator</button>
              <button onClick={() => grantRole(user, "admin")}><Crown size={16} /> Admin</button>
            </div>

            <label className="field-label wide-field">
              Точное право
              <select
                value={selectedPermission}
                onChange={(event) => setSelectedPermission(event.target.value)}
              >
                <option value="">Выбрать permission</option>
                {commandPermissions.map((permission) => (
                  <option key={permission.key} value={permission.key}>{permission.key}</option>
                ))}
              </select>
            </label>

            <div className="settings-actions">
              <button onClick={() => setPermission(user, "allow")}>Разрешить</button>
              <button className="danger-button" onClick={() => setPermission(user, "deny")}>Запретить</button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function buildCommandParams(
  command: CommandDef,
  currentValues: Record<string, string>,
  onlinePlayers: string[]
): Record<string, string> {
  const params: Record<string, string> = { ...currentValues };

  for (const [name, param] of Object.entries(command.paramsSchema)) {
    if (param.type === "own_minecraft_username") continue;
    if (params[name]) continue;

    if (param.type === "minecraft_username" && onlinePlayers[0]) {
      params[name] = onlinePlayers[0];
    }
    if (param.type === "enum") {
      params[name] = param.default || param.values[0];
    }
    if (param.type === "string" && param.default) {
      params[name] = param.default;
    }
  }

  return params;
}

function userLabel(user: UserListItem): string {
  return user.first_name || user.telegram_username || String(user.telegram_user_id);
}

function statusLabel(status: string): string {
  if (status === "active") return "Активен";
  if (status === "pending") return "Заявка";
  if (status === "blocked") return "Отклонен";
  return status;
}

function sameMinecraftName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function setCommandValue(
  setValues: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>,
  commandKey: string,
  field: string,
  value: string
) {
  setValues((current) => ({
    ...current,
    [commandKey]: {
      ...(current[commandKey] || {}),
      [field]: value
    }
  }));
}
