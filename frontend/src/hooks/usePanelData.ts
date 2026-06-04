import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import type { CommandDef, MeResponse, PermissionDef, ServerStatus, UserListItem } from "../lib/types";

export function usePanelData(enabled: boolean) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [commands, setCommands] = useState<CommandDef[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionDef[]>([]);
  const [busy, setBusy] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState("");

  const can = useMemo(() => new Set(me?.permissions || []), [me]);

  const load = useCallback(async () => {
    if (!enabled) return;

    setBusy(true);
    setError(null);

    try {
      const profile = await api<MeResponse>("/auth/me");
      setMe(profile);

      if (profile.user.status !== "active") {
        setStatus(null);
        setCommands([]);
        setUsers([]);
        setPermissionCatalog([]);
        return;
      }

      const [serverStatus, commandCatalog, userList, catalog] = await Promise.all([
        api<ServerStatus>("/server/status"),
        api<{ commands: CommandDef[] }>("/commands"),
        profile.permissions.includes("users.manage")
          ? api<{ users: UserListItem[] }>("/users")
          : Promise.resolve({ users: [] }),
        profile.permissions.includes("roles.manage")
          ? api<{ permissions: PermissionDef[] }>("/users/permissions/catalog")
          : Promise.resolve({ permissions: [] })
      ]);

      setStatus(serverStatus);
      setCommands(commandCatalog.commands);
      setUsers(userList.users);
      setPermissionCatalog(catalog.permissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setBusy(false);
      return;
    }

    void load();
  }, [enabled, load]);

  return {
    me,
    status,
    commands,
    users,
    permissionCatalog,
    busy,
    error,
    output,
    setOutput,
    can,
    load
  };
}
