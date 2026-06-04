import { Ban, CheckCircle2, Crown, Gamepad2, Link, Shield, UserCog, Wifi, WifiOff, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import { sameMinecraftName, statusLabel, userLabel } from "../lib/panel";
import type { PermissionDef, UserListItem } from "../lib/types";

type UsersSettingsPanelProps = {
  users: UserListItem[];
  permissions: PermissionDef[];
  canManageRoles: boolean;
  onlinePlayers: string[];
  reload: () => Promise<void>;
};

export function UsersSettingsPanel({
  users,
  permissions,
  canManageRoles,
  onlinePlayers,
  reload
}: UsersSettingsPanelProps) {
  const [selectedPermission, setSelectedPermission] = useState<Record<number, string>>({});
  const [minecraftNames, setMinecraftNames] = useState<Record<number, string>>({});
  const [selectedUserId, setSelectedUserId] = useState<number | null>(users[0]?.id ?? null);
  const visibleUsers = useMemo(() => users.filter((user) => user.status !== "blocked"), [users]);
  const commandPermissions = permissions.filter((permission) => permission.category === "command");
  const selectedUser = visibleUsers.find((user) => user.id === selectedUserId) || visibleUsers[0];
  const pendingCount = visibleUsers.filter((user) => user.status === "pending").length;

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
          {visibleUsers.length} всего · {pendingCount} заявок
        </span>
      </div>

      <div className="settings-panel">
        <div className="user-picker">
          <label className="field-label">
            Пользователь
            <select value={selectedUser?.id || ""} onChange={(event) => setSelectedUserId(Number(event.target.value))}>
              {visibleUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {userLabel(user)} · {statusLabel(user.status)}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-stats">
            <span>{pendingCount} заявок</span>
            <span>{visibleUsers.length - pendingCount} активных</span>
          </div>
        </div>

        {selectedUser ? (
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
        ) : (
          <div className="notice">Нет активных пользователей и заявок.</div>
        )}
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

  return (
    <article className={`settings-card user-status-${user.status}`}>
      <div className="settings-summary">
        <div className="selected-user-title">
          <div className="user-avatar">{avatarText}</div>
          <div>
            <p className="eyebrow">Пользователь</p>
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
              <input value={minecraftName} placeholder="Minecraft ник" onChange={(event) => setMinecraftName(event.target.value)} />
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
            <button className="primary-button" disabled={user.status === "active"} onClick={() => setStatus(user, "active")}>
              <CheckCircle2 size={16} /> Активировать
            </button>
            <button className="danger-button" onClick={() => setStatus(user, "blocked")}>
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
                <button className="secondary-button" onClick={() => grantRole(user, "player")}>
                  <Shield size={16} /> Player
                </button>
                <button className="secondary-button" onClick={() => grantRole(user, "moderator")}>
                  <Ban size={16} /> Moderator
                </button>
                <button className="secondary-button" onClick={() => grantRole(user, "admin")}>
                  <Crown size={16} /> Admin
                </button>
              </div>
            </section>

            <section className="settings-block wide-field">
              <div className="settings-block-title">
                <UserCog size={16} />
                Точное право
              </div>
              <label className="field-label">
                Permission
                <select value={selectedPermission} onChange={(event) => setSelectedPermission(event.target.value)}>
                  <option value="">Выбрать permission</option>
                  {commandPermissions.map((permission) => (
                    <option key={permission.key} value={permission.key}>
                      {permission.key}
                    </option>
                  ))}
                </select>
              </label>
              <div className="settings-actions two-columns">
                <button className="primary-button" onClick={() => setPermission(user, "allow")}>Разрешить</button>
                <button className="danger-button" onClick={() => setPermission(user, "deny")}>
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
