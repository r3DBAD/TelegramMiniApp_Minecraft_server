import { Accordion, ActionIcon, Badge, Button, Group, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import {
  IconChevronRight,
  IconFilter,
  IconInbox,
  IconKey,
  IconLink,
  IconPlus,
  IconSearch,
  IconShieldCheck,
  IconTerminal2,
  IconTrash,
  IconUsers,
  IconWorld
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Crown,
  FileClock,
  Gamepad2,
  ListChecks,
  LockKeyhole,
  Shield,
  UserCog,
  UserPlus,
  Wifi,
  WifiOff,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import { auditActionLabel, permissionLabel, riskLabels, sameMinecraftName, statusLabel, userLabel } from "../lib/panel";
import type { AccessRequestItem, AuditEvent, OpsResponse, PermissionDef, UserListItem, UserPermissionState, WhitelistResponse } from "../lib/types";

type UsersSettingsPanelProps = {
  users: UserListItem[];
  permissions: PermissionDef[];
  accessRequests: AccessRequestItem[];
  auditEvents: AuditEvent[];
  whitelist: WhitelistResponse | null;
  ops: OpsResponse | null;
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
  ops,
  currentUserId,
  canManageRoles,
  canManageWhitelist,
  canReadAudit,
  onlinePlayers,
  reload
}: UsersSettingsPanelProps) {
  const [minecraftNames, setMinecraftNames] = useState<Record<number, string>>({});
  const [selectedUserId, setSelectedUserId] = useState<number | null>(users[0]?.id ?? null);
  const visibleUsers = useMemo(
    () =>
      users
        .sort((left, right) => accessSortScore(right.status) - accessSortScore(left.status)),
    [users]
  );
  const selectedUser = visibleUsers.find((user) => user.id === selectedUserId) || visibleUsers[0];
  const pendingCount = accessRequests.length || visibleUsers.filter((user) => user.status === "pending").length;
  const activeCount = visibleUsers.filter((user) => user.status === "active").length;
  const blockedCount = visibleUsers.filter((user) => user.status === "blocked").length;
  const operatorCount = ops?.ops.length || 0;

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
    <motion.section className="user-list" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="section-head">
        <div>
          <p className="eyebrow">Admin access</p>
          <h2>
            <UserCog size={18} /> Доступ и доверенные игроки
          </h2>
        </div>
        <span>
          {activeCount} можно · {blockedCount} нельзя · {pendingCount} заявок
        </span>
      </div>

      <div className="settings-panel">
        <AccessRequestInbox requests={accessRequests} users={users} setStatus={setStatus} />

        <div className="user-admin-layout">
          <aside className="access-overview" aria-label="Пользователи">
            <div className="settings-stats">
              <span>{pendingCount} заявок</span>
              <span>{activeCount} можно</span>
              <span>{blockedCount} нельзя</span>
              <span>{onlinePlayers.length} онлайн</span>
              <span>{operatorCount} ops</span>
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
              currentUserId={currentUserId}
              onlinePlayers={onlinePlayers}
              minecraftName={
                minecraftNames[selectedUser.id] ??
                selectedUser.minecraft_username ??
                selectedUser.requested_minecraft_username ??
                ""
              }
              setMinecraftName={(value) => setMinecraftNames((current) => ({ ...current, [selectedUser.id]: value }))}
              setStatus={setStatus}
              setMinecraftProfile={setMinecraftProfile}
            />
          )}
        </div>

        <OpsManager ops={ops} />
        <WhitelistManager whitelist={whitelist} canManageWhitelist={canManageWhitelist} reload={reload} />
        {canReadAudit && <AuditLog events={auditEvents} />}
      </div>
    </motion.section>
  );
}

function accessSortScore(status: string): number {
  if (status === "pending") return 3;
  if (status === "active") return 2;
  if (status === "blocked") return 1;
  return 0;
}

function OpsManager({ ops }: { ops: OpsResponse | null }) {
  if (!ops) return null;

  return (
    <section className="manager-section ops-section">
      <div className="manager-head">
        <div>
          <p className="eyebrow">Minecraft ops</p>
          <h3>
            <Crown size={17} /> Операторы сервера
          </h3>
        </div>
        <span>{ops.ops.length}</span>
      </div>
      <p className="manager-note">
        Operator-статус дает права внутри Minecraft. Держи здесь только owner/admin; выдача и снятие доступны через RCON-команды op/deop.
      </p>
      <div className="ops-list">
        {ops.ops.map((entry) => (
          <article className="ops-card" key={entry.uuid || entry.name}>
            <div className="whitelist-player">
              {entry.name ? <img src={minecraftHead(entry.name, 40)} alt="" loading="lazy" /> : <Crown size={18} />}
              <div>
                <strong>{entry.name || entry.uuid}</strong>
                <span>level {entry.level ?? "?"}{entry.bypassesPlayerLimit ? " · bypass limit" : ""}</span>
              </div>
            </div>
            <span className="ops-risk">critical</span>
          </article>
        ))}
        {ops.ops.length === 0 && (
          <div className="empty-inline empty-soft">
            <IconInbox size={22} />
            <span>ops.json пуст</span>
          </div>
        )}
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
        <div className="empty-inline empty-soft">
          <IconInbox size={22} />
          <div>
          <p className="eyebrow">Заявки</p>
          <h3>
            <ListChecks size={17} /> Очередь пустая
          </h3>
          </div>
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
  currentUserId?: number;
  onlinePlayers: string[];
  minecraftName: string;
  setMinecraftName: (value: string) => void;
  setStatus: (user: UserListItem, status: string) => Promise<void>;
  setMinecraftProfile: (user: UserListItem) => Promise<void>;
};

function SelectedUserSettings({
  user,
  currentUserId,
  onlinePlayers,
  minecraftName,
  setMinecraftName,
  setStatus,
  setMinecraftProfile
}: SelectedUserSettingsProps) {
  const isOnline = Boolean(
    user.minecraft_username && onlinePlayers.some((player) => sameMinecraftName(player, user.minecraft_username!))
  );
  const name = userLabel(user);
  const avatarName = user.minecraft_username || user.requested_minecraft_username || name;
  const isSelf = user.id === currentUserId;
  const protectedSelf = isSelf && user.status === "active";
  const allowed = user.status === "active";

  async function updateStatus(nextStatus: string) {
    if (protectedSelf && nextStatus !== "active") return;
    if (nextStatus === "blocked" && !confirm(`Отклонить доступ для ${name}?`)) return;
    await setStatus(user, nextStatus);
  }

  return (
    <article className={`user-detail-card user-status-${user.status}`}>
      <div className="settings-summary">
        <div className="selected-user-title">
          <div className="player-avatar-wrap">
            <div className="user-avatar">
              <img src={minecraftHead(avatarName, 64)} alt="" loading="lazy" />
            </div>
            <span className={isOnline ? "presence-dot online" : "presence-dot"} />
          </div>
          <div>
            <p className="eyebrow">{user.status === "pending" ? "Новая заявка" : "Пользователь"}</p>
            <h2>{name}</h2>
            <div className="user-badges">
              <span className={`status-dot ${user.status}`}>{statusLabel(user.status)}</span>
              {allowed ? <span className="role-badge admin">admin</span> : <span>no access</span>}
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
          <label className="field-label compact-profile">
            <div className="profile-link">
              <IconLink className="profile-input-icon" size={16} />
              <input
                name={`minecraft-profile-${user.id}`}
                value={minecraftName}
                placeholder="Minecraft ник"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setMinecraftName(event.target.value)}
              />
              <button className="secondary-button icon-chevron-button" onClick={() => setMinecraftProfile(user)} aria-label="Привязать Minecraft профиль">
                <IconChevronRight size={17} />
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
              <LockKeyhole size={15} /> Это твой admin-профиль. Самому себе нельзя забирать доступ.
            </p>
          )}
          <div className="settings-row">
            <span>{allowed ? "Можно: полный доступ" : "Нельзя: доступа нет"}</span>
            <Switch
              checked={allowed}
              disabled={protectedSelf}
              color="green"
              onChange={(event) => updateStatus(event.currentTarget.checked ? "active" : "blocked")}
            />
          </div>
        </section>

        <section className="settings-block">
          <div className="settings-block-title">
            <Crown size={16} />
            Единая роль
          </div>
          <div className={allowed ? "single-role-card enabled" : "single-role-card"}>
            <strong>{allowed ? "admin" : "нет роли"}</strong>
            <span>{allowed ? "Полный доступ к интерфейсу, RCON, whitelist, ops и журналу." : "Пользователь не может открыть панель и выполнять функции."}</span>
          </div>
        </section>
      </div>
    </article>
  );
}

const roleOptions = [
  { key: "owner", label: "Owner" },
  { key: "admin", label: "Admin" },
  { key: "moderator", label: "Moderator" },
  { key: "player", label: "Player" }
];

function primaryRole(roles: string[]): string {
  return roleOptions.find((role) => roles.includes(role.key))?.key || "player";
}

function PermissionMatrix({
  permissions,
  fallback,
  busy,
  disabled,
  onAllow,
  onDeny
}: {
  permissions: UserPermissionState[];
  fallback: PermissionDef[];
  busy: boolean;
  disabled: boolean;
  onAllow: (permissionKey: string) => Promise<void>;
  onDeny: (permissionKey: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
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
  const filteredRows = sortedRows.filter((permission) => {
    const haystack = `${permission.key} ${permission.description} ${permissionLabel(permission.key)}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const groups = groupPermissions(filteredRows);

  if (busy && rows.length === 0) {
    return <div className="notice">Загружаю права пользователя...</div>;
  }

  return (
    <Stack gap="sm" className="permission-list-wrap">
      <TextInput
        className="permission-search"
        leftSection={<IconSearch size={16} />}
        value={query}
        placeholder="Найти право"
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <Accordion className="permission-accordion" multiple defaultValue={Object.keys(groups)}>
        {Object.entries(groups).map(([group, groupRows]) => (
          <Accordion.Item value={group} key={group}>
            <Accordion.Control icon={permissionGroupIcon(group)}>{group}</Accordion.Control>
            <Accordion.Panel>
              <Stack gap={6}>
                {groupRows.map((permission) => (
                  <PermissionRow
                    key={permission.key}
                    permission={permission}
                    disabled={disabled}
                    onAllow={onAllow}
                    onDeny={onDeny}
                  />
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      {filteredRows.length === 0 && <div className="notice">Права не найдены.</div>}
    </Stack>
  );
}

function PermissionRow({
  permission,
  disabled,
  onAllow,
  onDeny
}: {
  permission: UserPermissionState;
  disabled: boolean;
  onAllow: (permissionKey: string) => Promise<void>;
  onDeny: (permissionKey: string) => Promise<void>;
}) {
  return (
    <div className={`permission-row ${permission.effective ? "enabled" : ""}`}>
      <div className="permission-row-icon">{permissionIcon(permission.key)}</div>
      <div className="permission-row-body">
        <Text fw={720}>{permissionLabel(permission.key)}</Text>
        <Text c="dimmed" size="xs" truncate>{permission.description}</Text>
      </div>
      <Badge className={`risk-badge ${permission.risk_level}`}>{riskLabels[permission.risk_level]}</Badge>
      <Switch
        checked={permission.effective}
        disabled={disabled}
        color="green"
        onChange={(event) => (event.currentTarget.checked ? onAllow(permission.key) : onDeny(permission.key))}
      />
    </div>
  );
}

function groupPermissions(rows: UserPermissionState[]): Record<string, UserPermissionState[]> {
  return rows.reduce<Record<string, UserPermissionState[]>>((groups, permission) => {
    const group = permissionGroup(permission.key);
    groups[group] = [...(groups[group] || []), permission];
    return groups;
  }, {});
}

function permissionGroup(key: string): string {
  if (key.includes("tp") || key.includes("kick") || key.includes("ban") || key.includes("whitelist") || key.includes("ops")) {
    return "Игроки";
  }
  if (key.includes("weather") || key.includes("time") || key.includes("difficulty") || key.includes("save") || key.includes("gamemode")) {
    return "Мир";
  }
  return "Команды";
}

function permissionGroupIcon(group: string) {
  if (group === "Игроки") return <IconUsers size={16} />;
  if (group === "Мир") return <IconWorld size={16} />;
  return <IconTerminal2 size={16} />;
}

function permissionIcon(key: string) {
  if (key.includes("whitelist") || key.includes("users") || key.includes("roles")) return <IconShieldCheck size={16} />;
  if (key.includes("weather") || key.includes("time") || key.includes("difficulty")) return <IconWorld size={16} />;
  return <IconKey size={16} />;
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
        <Group className="whitelist-add-row" gap="xs" wrap="nowrap">
          <TextInput
            value={username}
            name="whitelistUsername"
            placeholder="Добавить игрока"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setUsername(event.currentTarget.value)}
          />
          <Button variant="subtle" rightSection={<IconPlus size={16} />} onClick={addPlayer}>
            Добавить
          </Button>
        </Group>
      )}

      <div className="whitelist-list">
        {entries.map((entry) => (
          <article className="whitelist-card" key={entry.uuid || entry.name}>
            <div className="whitelist-player">
              {entry.name ? <img src={minecraftHead(entry.name, 40)} alt="" loading="lazy" /> : <Gamepad2 size={18} />}
              <div>
                <strong>{entry.name || entry.uuid}</strong>
                <span>Доступ к серверу</span>
              </div>
            </div>
            {canManageWhitelist && entry.name && (
              <ActionIcon
                className="whitelist-delete"
                variant="subtle"
                aria-label={`Убрать ${entry.name} из whitelist`}
                onClick={() => removePlayer(entry.name!)}
              >
                <IconTrash size={18} />
              </ActionIcon>
            )}
          </article>
        ))}
        {entries.length === 0 && (
          <div className="empty-inline empty-soft">
            <IconInbox size={22} />
            <span>Whitelist пуст</span>
          </div>
        )}
      </div>
    </section>
  );
}

function AuditLog({ events }: { events: AuditEvent[] }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredEvents = events.filter((event) => {
    const actor = event.first_name || event.telegram_username || "System";
    const text = `${actor} ${auditActionLabel(event.action)} ${metadataPreview(event)}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

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
        <div className="empty-inline empty-soft">
          <IconInbox size={22} />
          <span>Пока нет записей</span>
        </div>
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
        <Group gap={8}>
          <ActionIcon variant="subtle" className="audit-filter-button" aria-label="Фильтр журнала" onClick={() => setFilterOpen((value) => !value)}>
            <IconFilter size={18} />
          </ActionIcon>
          <span>{filteredEvents.length}</span>
        </Group>
      </div>

      {filterOpen && (
        <TextInput
          className="audit-filter-row"
          leftSection={<IconSearch size={16} />}
          value={query}
          placeholder="Фильтр по игроку или действию"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      )}

      <div className="audit-chat-list">
        {filteredEvents.slice(0, 16).map((event) => {
          const actor = event.first_name || event.telegram_username || "System";
          const isSystem = actor === "System";
          return (
          <article className={isSystem ? "audit-chat-row system" : "audit-chat-row"} key={event.id}>
            <time className="audit-chat-time" dateTime={event.created_at}>{formatTime(event.created_at)}</time>
            <div className="audit-chat-message">
              <strong>{actor}:</strong>
              <span>{auditLine(event)}</span>
            </div>
          </article>
          );
        })}
        {filteredEvents.length === 0 && <div className="notice">По фильтру ничего не найдено.</div>}
      </div>
    </section>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function auditLine(event: AuditEvent): string {
  const details = metadataPreview(event);
  return details ? `${auditActionLabel(event.action)} · ${details}` : auditActionLabel(event.action);
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
