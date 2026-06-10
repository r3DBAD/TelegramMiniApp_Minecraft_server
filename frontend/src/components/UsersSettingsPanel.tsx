import {
  Ban,
  CheckCircle2,
  Crown,
  FileClock,
  Gamepad2,
  KeyRound,
  Link,
  ListChecks,
  LockKeyhole,
  MinusCircle,
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
import type { AccessRequestItem, AuditEvent, PermissionDef, UserListItem, UserPermissionState, WhitelistResponse } from "../lib/types";

type UsersSettingsPanelProps = {
  users: UserListItem[];
  permissions: PermissionDef[];
  accessRequests: AccessRequestItem[];
  auditEvents: AuditEvent[];
  whitelist: WhitelistResponse | null;
  currentUserId?: number;
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
  currentUserId,
  canManageRoles,
  canManageWhitelist,
  canReadAudit,
  onlinePlayers,
  reload
}: UsersSettingsPanelProps) {
  const [minecraftNames, setMinecraftNames] = useState<Record<number, string>>({});
  const [permissionState, setPermissionState] = useState<Record<number, UserPermissionState[]>>({});
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionReloadToken, setPermissionReloadToken] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(users[0]?.id ?? null);
  const visibleUsers = useMemo(
    () =>
      users
        .filter((user) => user.status !== "blocked")
        .sort((left, right) => Number(right.status === "pending") - Number(left.status === "pending")),
    [users]
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

  useEffect(() => {
    if (!selectedUser || !canManageRoles) return;

    let cancelled = false;
    setPermissionBusy(true);
    api<{ permissions: UserPermissionState[] }>(`/users/${selectedUser.id}/permissions/effective`)
      .then((result) => {
        if (!cancelled) {
          setPermissionState((current) => ({ ...current, [selectedUser.id]: result.permissions }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPermissionState((current) => ({ ...current, [selectedUser.id]: [] }));
        }
      })
      .finally(() => {
        if (!cancelled) setPermissionBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManageRoles, permissionReloadToken, selectedUser]);

  function refreshPermissionState() {
    setPermissionReloadToken((value) => value + 1);
  }

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
    refreshPermissionState();
  }

  async function revokeRole(user: UserListItem, roleKey: string) {
    await api(`/users/${user.id}/roles/${roleKey}`, { method: "DELETE" });
    await reload();
    refreshPermissionState();
  }

  async function setPermission(user: UserListItem, permissionKey: string, effect: "allow" | "deny") {
    await api(`/users/${user.id}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissionKey, effect, reason: "Mini App override" })
    });
    await reload();
    refreshPermissionState();
  }

  async function clearPermission(user: UserListItem, permissionKey: string) {
    await api(`/users/${user.id}/permissions/${encodeURIComponent(permissionKey)}`, { method: "DELETE" });
    await reload();
    refreshPermissionState();
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
                  <img className="mini-head" src={minecraftHead(user.minecraft_username || user.requested_minecraft_username || userLabel(user), 28)} alt="" loading="lazy" />
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
              permissions={permissionState[selectedUser.id] || []}
              permissionsFallback={permissions}
              permissionsBusy={permissionBusy}
              currentUserId={currentUserId}
              canManageRoles={canManageRoles}
              onlinePlayers={onlinePlayers}
              minecraftName={
                minecraftNames[selectedUser.id] ??
                selectedUser.minecraft_username ??
                selectedUser.requested_minecraft_username ??
                ""
              }
              setMinecraftName={(value) => setMinecraftNames((current) => ({ ...current, [selectedUser.id]: value }))}
              setStatus={setStatus}
              grantRole={grantRole}
              revokeRole={revokeRole}
              setPermission={setPermission}
              clearPermission={clearPermission}
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
  permissions: UserPermissionState[];
  permissionsFallback: PermissionDef[];
  permissionsBusy: boolean;
  currentUserId?: number;
  canManageRoles: boolean;
  onlinePlayers: string[];
  minecraftName: string;
  setMinecraftName: (value: string) => void;
  setStatus: (user: UserListItem, status: string) => Promise<void>;
  grantRole: (user: UserListItem, roleKey: string) => Promise<void>;
  revokeRole: (user: UserListItem, roleKey: string) => Promise<void>;
  setPermission: (user: UserListItem, permissionKey: string, effect: "allow" | "deny") => Promise<void>;
  clearPermission: (user: UserListItem, permissionKey: string) => Promise<void>;
  setMinecraftProfile: (user: UserListItem) => Promise<void>;
};

function SelectedUserSettings({
  user,
  permissions,
  permissionsFallback,
  permissionsBusy,
  currentUserId,
  canManageRoles,
  onlinePlayers,
  minecraftName,
  setMinecraftName,
  setStatus,
  grantRole,
  revokeRole,
  setPermission,
  clearPermission,
  setMinecraftProfile
}: SelectedUserSettingsProps) {
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const isOnline = Boolean(
    user.minecraft_username && onlinePlayers.some((player) => sameMinecraftName(player, user.minecraft_username!))
  );
  const name = userLabel(user);
  const avatarName = user.minecraft_username || user.requested_minecraft_username || name;
  const isSelf = user.id === currentUserId;
  const isOwner = user.roles.includes("owner");
  const protectedSelf = isSelf && isOwner;

  async function updateStatus(nextStatus: string) {
    if (protectedSelf && nextStatus !== "active") return;
    if (nextStatus === "blocked" && !confirm(`Отклонить доступ для ${name}?`)) return;
    await setStatus(user, nextStatus);
  }

  async function updateRole(roleKey: string, action: "grant" | "revoke") {
    if (protectedSelf) return;
    if (action === "revoke" && !confirm(`Снять роль ${roleKey} у ${name}?`)) return;
    if (action === "grant") {
      await grantRole(user, roleKey);
    } else {
      await revokeRole(user, roleKey);
    }
    setRoleSheetOpen(false);
  }

  async function updatePermission(permissionKey: string, effect: "allow" | "deny") {
    if (protectedSelf) return;
    if (effect === "deny" && !confirm(`Запретить право "${permissionLabel(permissionKey)}" для ${name}?`)) return;
    await setPermission(user, permissionKey, effect);
  }

  async function removeOverride(permissionKey: string) {
    if (protectedSelf) return;
    await clearPermission(user, permissionKey);
  }

  return (
    <article className={`user-detail-card user-status-${user.status}`}>
      <div className="settings-summary">
        <div className="selected-user-title">
          <button className="user-avatar" onClick={() => setRoleSheetOpen(true)} aria-label="Открыть роли пользователя">
            <img src={minecraftHead(avatarName, 64)} alt="" loading="lazy" />
          </button>
          <div>
            <p className="eyebrow">{user.status === "pending" ? "Новая заявка" : "Пользователь"}</p>
            <h2>{name}</h2>
            <div className="user-badges">
              <span className={`status-dot ${user.status}`}>{statusLabel(user.status)}</span>
              {user.roles.length > 0 ? user.roles.map((role) => <span className={`role-badge ${role}`} key={role}>{role}</span>) : <span>no role</span>}
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
          {protectedSelf && (
            <p className="guard-note">
              <LockKeyhole size={15} /> Это твой owner-профиль. Самому себе нельзя забирать доступ, роли и права.
            </p>
          )}
          <div className="settings-actions two-columns">
            {user.status === "pending" ? (
              <button className="primary-button" disabled={protectedSelf} onClick={() => updateStatus("active")}>
                <CheckCircle2 size={16} /> Одобрить
              </button>
            ) : (
              <button className="secondary-button" disabled>
                <CheckCircle2 size={16} /> Активен
              </button>
            )}
            <button className="danger-button" disabled={protectedSelf} onClick={() => updateStatus("blocked")}>
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
              <div className="role-summary">
                {user.roles.length > 0 ? user.roles.map((role) => <span className={`role-badge ${role}`} key={role}>{role}</span>) : <span className="role-badge player">no role</span>}
              </div>
              <button className="secondary-button role-sheet-button" onClick={() => setRoleSheetOpen(true)}>
                <Crown size={16} /> Настроить роль
              </button>
            </section>

            <section className="settings-block wide-field">
              <div className="settings-block-title">
                <UserCog size={16} />
                Права
              </div>
              <PermissionMatrix
                permissions={permissions}
                fallback={permissionsFallback}
                busy={permissionsBusy}
                disabled={protectedSelf}
                onAllow={(permissionKey) => updatePermission(permissionKey, "allow")}
                onDeny={(permissionKey) => updatePermission(permissionKey, "deny")}
                onClear={removeOverride}
              />
            </section>
          </>
        )}
      </div>
      {roleSheetOpen && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setRoleSheetOpen(false)}>
          <section className="confirm-sheet role-sheet" role="dialog" aria-modal="true" aria-labelledby="role-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div>
              <p className="eyebrow">Roles</p>
              <h2 id="role-sheet-title">Роли {name}</h2>
            </div>
            {protectedSelf && (
              <p className="guard-note">
                <LockKeyhole size={15} /> Свой owner-профиль защищен от самоблокировки.
              </p>
            )}
            <RoleMatrix roles={user.roles} disabled={protectedSelf} onChange={updateRole} />
          </section>
        </div>
      )}
    </article>
  );
}

const roleOptions = [
  { key: "player", label: "Player", icon: Shield },
  { key: "moderator", label: "Moderator", icon: Ban },
  { key: "admin", label: "Admin", icon: Crown },
  { key: "owner", label: "Owner", icon: Crown }
];

function RoleMatrix({
  roles,
  disabled,
  onChange
}: {
  roles: string[];
  disabled: boolean;
  onChange: (roleKey: string, action: "grant" | "revoke") => Promise<void>;
}) {
  return (
    <div className="role-matrix">
      {roleOptions.map((role) => {
        const Icon = role.icon;
        const enabled = roles.includes(role.key);
        return (
          <button
            className={enabled ? "role-row enabled" : "role-row"}
            key={role.key}
            disabled={disabled}
            onClick={() => onChange(role.key, enabled ? "revoke" : "grant")}
          >
            <span>
              <Icon size={16} />
              {role.label}
            </span>
            <span className="role-switch" aria-hidden="true"><i /></span>
          </button>
        );
      })}
    </div>
  );
}

function PermissionMatrix({
  permissions,
  fallback,
  busy,
  disabled,
  onAllow,
  onDeny,
  onClear
}: {
  permissions: UserPermissionState[];
  fallback: PermissionDef[];
  busy: boolean;
  disabled: boolean;
  onAllow: (permissionKey: string) => Promise<void>;
  onDeny: (permissionKey: string) => Promise<void>;
  onClear: (permissionKey: string) => Promise<void>;
}) {
  const rows: UserPermissionState[] = permissions.length
    ? permissions
    : fallback.map((permission) => ({
        ...permission,
        role_keys: [],
        effective: false
      }));
  const sortedRows = [...rows].sort((left, right) => {
    const leftScore = Number(right.effective) - Number(left.effective);
    if (leftScore !== 0) return leftScore;
    return left.key.localeCompare(right.key);
  });

  if (busy && rows.length === 0) {
    return <div className="notice">Загружаю права пользователя...</div>;
  }

  return (
    <div className="permission-grid" aria-label="Права пользователя">
      {sortedRows.map((permission) => {
        const denied = permission.override_effect === "deny";
        const allowedOverride = permission.override_effect === "allow";
        const byRole = permission.role_keys.length > 0;
        const stateLabel = denied
          ? "Запрещено"
          : allowedOverride
            ? "Выдано вручную"
            : byRole
              ? `По роли: ${permission.role_keys.join(", ")}`
              : permission.effective
                ? "Активно"
                : "Нет";

        return (
          <article
            className={`permission-tile ${permission.effective ? "enabled" : ""} ${denied ? "denied" : ""}`}
            key={permission.key}
          >
            <div className="permission-topline">
              <span>
                <KeyRound size={15} />
                {permissionLabel(permission.key)}
              </span>
              <small className={`risk-badge ${permission.risk_level}`}>{riskLabels[permission.risk_level]}</small>
            </div>
            <p>{permission.description}</p>
            <div className="permission-state">
              <span>{stateLabel}</span>
              {permission.override_effect && <small>override</small>}
            </div>
            <div className="permission-actions">
              <button className="primary-button" disabled={disabled || allowedOverride} onClick={() => onAllow(permission.key)}>
                Разрешить
              </button>
              <button className="danger-button" disabled={disabled || denied} onClick={() => onDeny(permission.key)}>
                Запретить
              </button>
              <button className="secondary-button" disabled={disabled || !permission.override_effect} onClick={() => onClear(permission.key)}>
                <MinusCircle size={14} /> Сбросить
              </button>
            </div>
          </article>
        );
      })}
    </div>
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
            {entry.name ? <img src={minecraftHead(entry.name, 24)} alt="" loading="lazy" /> : <Gamepad2 size={15} />}
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
            {metadataPreview(event) && <small>{metadataPreview(event)}</small>}
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

function metadataPreview(event: AuditEvent): string {
  const metadata = normalizeMetadata(event.metadata);
  const parts: string[] = [];

  if (typeof metadata.commandKey === "string") parts.push(`Команда: ${metadata.commandKey}`);
  if (typeof metadata.permissionKey === "string") parts.push(`Право: ${permissionLabel(metadata.permissionKey)}`);
  if (typeof metadata.roleKey === "string") parts.push(`Роль: ${metadata.roleKey}`);
  if (typeof metadata.username === "string") parts.push(`Ник: ${metadata.username}`);
  if (typeof metadata.status === "string") parts.push(`Статус: ${statusLabel(metadata.status)}`);
  if (typeof metadata.effect === "string") parts.push(metadata.effect === "allow" ? "Разрешено" : "Запрещено");

  if (parts.length > 0) return parts.slice(0, 3).join(" · ");

  return Object.entries(metadata)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

function normalizeMetadata(metadata: AuditEvent["metadata"]): Record<string, unknown> {
  if (!metadata) return {};
  if (typeof metadata !== "string") return metadata;
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function minecraftHead(username: string, size: number) {
  return `https://minotar.net/helm/${encodeURIComponent(username)}/${size}.png`;
}
