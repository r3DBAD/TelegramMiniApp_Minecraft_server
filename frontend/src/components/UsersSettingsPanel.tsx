import {
  Ban,
  CheckCircle2,
  Crown,
  FileClock,
  Gamepad2,
  Link,
  ListChecks,
  Shield,
  Trash2,
  UserCog,
  UserPlus,
  Wifi,
  WifiOff,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import { auditActionLabel, permissionLabel, riskLabels, sameMinecraftName, statusLabel, userLabel } from "../lib/panel";
import type { AccessRequestItem, AuditEvent, PermissionDef, UserListItem, WhitelistResponse } from "../lib/types";

type UsersSettingsPanelProps = {
  users: UserListItem[];
  permissions: PermissionDef[];
  accessRequests: AccessRequestItem[];
  auditEvents: AuditEvent[];
  whitelist: WhitelistResponse | null;
  canManageRoles: boolean;
  canManageWhitelist: boolean;
  canReadAudit: boolean;
  onlinePlayers: string[];
  reload: () => Promise<void>;
};

export function UsersSettingsPanel({
  users,
  permissions,
  accessRequests,
  auditEvents,
  whitelist,
  canManageRoles,
  canManageWhitelist,
  canReadAudit,
  onlinePlayers,
  reload
}: UsersSettingsPanelProps) {
  const [selectedPermission, setSelectedPermission] = useState<Record<number, string>>({});
  const [minecraftNames, setMinecraftNames] = useState<Record<number, string>>({});
  const [selectedUserId, setSelectedUserId] = useState<number | null>(users[0]?.id ?? null);
  const visibleUsers = useMemo(
    () =>
      users
        .filter((user) => user.status !== "blocked")
        .sort((left, right) => Number(right.status === "pending") - Number(left.status === "pending")),
    [users]
  );
  const commandPermissions = useMemo(
    () => permissions.filter((permission) => permission.category === "command"),
    [permissions]
  );
  const selectedUser = visibleUsers.find((user) => user.id === selectedUserId) || visibleUsers[0];
  const pendingCount = accessRequests.length || visibleUsers.filter((user) => user.status === "pending").length;
  const activeCount = visibleUsers.filter((user) => user.status === "active").length;

  useEffect(() => {
    if (!visibleUsers.length) {
      setSelectedUserId(null);
      return;
    }

    if (!selectedUserId || !visibleUsers.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(visibleUsers[0].id);
    }
  }, [selectedUserId, visibleUsers]);

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
          <h2>
            <UserCog size={18} /> Настройки доступа
          </h2>
        </div>
        <span>
          {activeCount} активных · {pendingCount} заявок
        </span>
      </div>

      <div className="settings-panel">
        <AccessRequestInbox requests={accessRequests} users={users} setStatus={setStatus} />

        <div className="user-admin-layout">
          <aside className="access-overview" aria-label="Пользователи">
            <div className="settings-stats">
              <span>{pendingCount} заявок</span>
              <span>{activeCount} активных</span>
              <span>{onlinePlayers.length} онлайн</span>
            </div>
            <div className="user-choice-list">
              {visibleUsers.map((user) => (
                <button
                  className={user.id === selectedUser?.id ? "active" : ""}
                  key={user.id}
                  aria-pressed={user.id === selectedUser?.id}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <span className={`mini-status ${user.status}`} aria-hidden="true" />
                  <strong>{userLabel(user)}</strong>
                  <small>{statusLabel(user.status)}</small>
                </button>
              ))}
              {visibleUsers.length === 0 && <div className="notice">Нет активных пользователей и заявок.</div>}
            </div>
          </aside>

          {selectedUser && (
            <SelectedUserSettings
              user={selectedUser}
              commandPermissions={commandPermissions}
              canManageRoles={canManageRoles}
              onlinePlayers={onlinePlayers}
              minecraftName={
                minecraftNames[selectedUser.id] ??
                selectedUser.minecraft_username ??
                selectedUser.requested_minecraft_username ??
                ""
              }
              selectedPermission={selectedPermission[selectedUser.id] || ""}
              setMinecraftName={(value) => setMinecraftNames((current) => ({ ...current, [selectedUser.id]: value }))}
              setSelectedPermission={(value) => setSelectedPermission((current) => ({ ...current, [selectedUser.id]: value }))}
              setStatus={setStatus}
              grantRole={grantRole}
              setPermission={setPermission}
              setMinecraftProfile={setMinecraftProfile}
            />
          )}
        </div>

        <WhitelistManager whitelist={whitelist} canManageWhitelist={canManageWhitelist} reload={reload} />
        {canReadAudit && <AuditLog events={auditEvents} />}
      </div>
    </section>
  );
}

type AccessRequestInboxProps = {
  requests: AccessRequestItem[];
  users: UserListItem[];
  setStatus: (user: UserListItem, status: string) => Promise<void>;
};

function AccessRequestInbox({ requests, users, setStatus }: AccessRequestInboxProps) {
  if (requests.length === 0) {
    return (
      <section className="request-inbox quiet">
        <div>
          <p className="eyebrow">Заявки</p>
          <h3>
            <ListChecks size={17} /> Очередь пустая
          </h3>
        </div>
        <span>Новые игроки появятся здесь</span>
      </section>
    );
  }

  return (
    <section className="request-inbox">
      <div className="request-inbox-head">
        <div>
          <p className="eyebrow">Заявки</p>
          <h3>
            <UserPlus size={17} /> Нужно решение
          </h3>
        </div>
        <span>{requests.length}</span>
      </div>
      <div className="request-list">
        {requests.map((request) => {
          const user = users.find((item) => item.id === request.user_id);
          const name = request.first_name || request.telegram_username || String(request.telegram_user_id);
          return (
            <article className="request-row" key={request.id}>
              <div>
                <strong>{name}</strong>
                <span>ID {request.telegram_user_id}</span>
                <small>{request.requested_minecraft_username || "Ник не указан"}</small>
              </div>
              <div className="request-actions">
                <button className="primary-button" disabled={!user} onClick={() => user && setStatus(user, "active")}>
                  <CheckCircle2 size={16} /> Одобрить
                </button>
                <button className="danger-button" disabled={!user} onClick={() => user && setStatus(user, "blocked")}>
                  <XCircle size={16} /> Отклонить
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type SelectedUserSettingsProps = {
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
};

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
}: SelectedUserSettingsProps) {
  const isOnline = Boolean(
    user.minecraft_username && onlinePlayers.some((player) => sameMinecraftName(player, user.minecraft_username!))
  );
  const name = userLabel(user);
  const avatarText = name.slice(0, 2).toUpperCase();

  async function updateStatus(nextStatus: string) {
    if (nextStatus === "blocked" && !confirm(`Отклонить доступ для ${name}?`)) return;
    await setStatus(user, nextStatus);
  }

  async function updatePermission(effect: "allow" | "deny") {
    if (!selectedPermission) return;
    if (effect === "deny" && !confirm(`Запретить право "${permissionLabel(selectedPermission)}" для ${name}?`)) return;
    await setPermission(user, effect);
  }

  return (
    <article className={`user-detail-card user-status-${user.status}`}>
      <div className="settings-summary">
        <div className="selected-user-title">
          <div className="user-avatar">{avatarText}</div>
          <div>
            <p className="eyebrow">{user.status === "pending" ? "Новая заявка" : "Пользователь"}</p>
            <h2>{name}</h2>
            <div className="user-badges">
              <span className={`status-dot ${user.status}`}>{statusLabel(user.status)}</span>
              <span>{user.roles.join(", ") || "no role"}</span>
            </div>
          </div>
        </div>
        <div className="user-meta">
          <span>
            <Gamepad2 size={15} /> {user.minecraft_username || user.requested_minecraft_username || "Ник не привязан"}
          </span>
          <span className={isOnline ? "status-pill online" : "status-pill offline"}>
            {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-block wide-field">
          <div className="settings-block-title">
            <Gamepad2 size={16} />
            Minecraft профиль
          </div>
          <label className="field-label">
            Ник игрока
            <div className="profile-link">
              <input
                name={`minecraft-profile-${user.id}`}
                value={minecraftName}
                placeholder="Minecraft ник"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setMinecraftName(event.target.value)}
              />
              <button className="secondary-button" onClick={() => setMinecraftProfile(user)}>
                <Link size={16} /> Привязать
              </button>
            </div>
          </label>
        </section>

        <section className="settings-block">
          <div className="settings-block-title">
            <Shield size={16} />
            Доступ
          </div>
          <div className="settings-actions two-columns">
            {user.status === "pending" ? (
              <button className="primary-button" onClick={() => updateStatus("active")}>
                <CheckCircle2 size={16} /> Одобрить
              </button>
            ) : (
              <button className="secondary-button" disabled>
                <CheckCircle2 size={16} /> Активен
              </button>
            )}
            <button className="danger-button" onClick={() => updateStatus("blocked")}>
              <XCircle size={16} /> Отклонить
            </button>
          </div>
        </section>

        {canManageRoles && (
          <>
            <section className="settings-block">
              <div className="settings-block-title">
                <Crown size={16} />
                Роль
              </div>
              <div className="settings-actions role-actions">
                <button className={user.roles.includes("player") ? "primary-button" : "secondary-button"} onClick={() => grantRole(user, "player")}>
                  <Shield size={16} /> Player
                </button>
                <button className={user.roles.includes("moderator") ? "primary-button" : "secondary-button"} onClick={() => grantRole(user, "moderator")}>
                  <Ban size={16} /> Moderator
                </button>
                <button className={user.roles.includes("admin") ? "primary-button" : "secondary-button"} onClick={() => grantRole(user, "admin")}>
                  <Crown size={16} /> Admin
                </button>
              </div>
            </section>

            <section className="settings-block wide-field">
              <div className="settings-block-title">
                <UserCog size={16} />
                Точные права
              </div>
              <div className="permission-grid" aria-label="Права пользователя">
                {commandPermissions.map((permission) => (
                  <button
                    className={selectedPermission === permission.key ? "permission-tile active" : "permission-tile"}
                    key={permission.key}
                    aria-pressed={selectedPermission === permission.key}
                    onClick={() => setSelectedPermission(permission.key)}
                  >
                    <span>
                      {permissionLabel(permission.key)}
                      <small className={`risk-badge ${permission.risk_level}`}>{riskLabels[permission.risk_level]}</small>
                    </span>
                    <small>{permission.description}</small>
                  </button>
                ))}
              </div>
              <div className="settings-actions two-columns">
                <button className="primary-button" disabled={!selectedPermission} onClick={() => updatePermission("allow")}>
                  Разрешить
                </button>
                <button className="danger-button" disabled={!selectedPermission} onClick={() => updatePermission("deny")}>
                  Запретить
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </article>
  );
}

type WhitelistManagerProps = {
  whitelist: WhitelistResponse | null;
  canManageWhitelist: boolean;
  reload: () => Promise<void>;
};

function WhitelistManager({ whitelist, canManageWhitelist, reload }: WhitelistManagerProps) {
  const [username, setUsername] = useState("");
  const entries = whitelist?.file || [];

  if (!whitelist && !canManageWhitelist) return null;

  async function addPlayer() {
    const name = username.trim();
    if (!name) return;
    await api("/server/whitelist", {
      method: "POST",
      body: JSON.stringify({ username: name })
    });
    setUsername("");
    await reload();
  }

  async function removePlayer(name: string) {
    if (!confirm(`Убрать ${name} из whitelist?`)) return;
    await api(`/server/whitelist/${encodeURIComponent(name)}`, { method: "DELETE" });
    await reload();
  }

  return (
    <section className="manager-section">
      <div className="manager-head">
        <div>
          <p className="eyebrow">Whitelist</p>
          <h3>
            <Shield size={17} /> Игроки с доступом
          </h3>
        </div>
        <span>{entries.length}</span>
      </div>

      {canManageWhitelist && (
        <label className="inline-add">
          <input
            value={username}
            name="whitelistUsername"
            placeholder="Minecraft ник"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setUsername(event.target.value)}
          />
          <button className="primary-button" onClick={addPlayer}>Добавить</button>
        </label>
      )}

      <div className="whitelist-grid">
        {entries.map((entry) => (
          <div className="whitelist-chip" key={entry.uuid || entry.name}>
            <Gamepad2 size={15} />
            <span>{entry.name || entry.uuid}</span>
            {canManageWhitelist && entry.name && (
              <button aria-label={`Убрать ${entry.name} из whitelist`} onClick={() => removePlayer(entry.name!)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {entries.length === 0 && <span className="empty-inline">Whitelist пуст</span>}
      </div>
    </section>
  );
}

function AuditLog({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <section className="manager-section">
        <div className="manager-head">
          <div>
            <p className="eyebrow">Audit</p>
            <h3>
              <FileClock size={17} /> Журнал действий
            </h3>
          </div>
        </div>
        <div className="notice">Пока нет записей.</div>
      </section>
    );
  }

  return (
    <section className="manager-section">
      <div className="manager-head">
        <div>
          <p className="eyebrow">Audit</p>
          <h3>
            <FileClock size={17} /> Журнал действий
          </h3>
        </div>
        <span>{events.length}</span>
      </div>
      <div className="audit-list">
        {events.slice(0, 12).map((event) => (
          <article className="audit-row" key={event.id}>
            <div>
              <strong>{auditActionLabel(event.action)}</strong>
              <span>{event.first_name || event.telegram_username || "System"}</span>
            </div>
            <time dateTime={event.created_at}>{formatDate(event.created_at)}</time>
            {metadataPreview(event.metadata) && <small>{metadataPreview(event.metadata)}</small>}
          </article>
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function metadataPreview(metadata: Record<string, unknown>): string {
  return Object.entries(metadata || {})
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}
