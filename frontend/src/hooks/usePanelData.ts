import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import type { AccessRequestItem, AuditEvent, CommandDef, MeResponse, OpsResponse, PermissionDef, ServerStatus, UserListItem, WhitelistResponse } from "../lib/types";

export function usePanelData(enabled: boolean) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [commands, setCommands] = useState<CommandDef[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionDef[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequestItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistResponse | null>(null);
  const [ops, setOps] = useState<OpsResponse | null>(null);
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
        setAccessRequests([]);
        setAuditEvents([]);
        setWhitelist(null);
        setOps(null);
        return;
      }

      const [serverStatus, commandCatalog, userList, catalog, requests, auditLog, whitelistData, opsData] = await Promise.all([
        api<ServerStatus>("/server/status"),
        api<{ commands: CommandDef[] }>("/commands"),
        profile.permissions.includes("users.manage")
          ? api<{ users: UserListItem[] }>("/users")
          : Promise.resolve({ users: [] }),
        profile.permissions.includes("roles.manage")
          ? api<{ permissions: PermissionDef[] }>("/users/permissions/catalog")
          : Promise.resolve({ permissions: [] }),
        profile.permissions.includes("users.manage")
          ? api<{ requests: AccessRequestItem[] }>("/users/access-requests")
          : Promise.resolve({ requests: [] }),
        profile.permissions.includes("audit.read")
          ? api<{ events: AuditEvent[] }>("/users/audit-log")
          : Promise.resolve({ events: [] }),
        profile.permissions.includes("minecraft.whitelist.read")
          ? api<WhitelistResponse>("/server/whitelist")
          : Promise.resolve(null),
        profile.permissions.includes("minecraft.ops.read")
          ? api<OpsResponse>("/server/ops")
          : Promise.resolve(null)
      ]);

      setStatus(serverStatus);
      setCommands(commandCatalog.commands);
      setUsers(userList.users);
      setPermissionCatalog(catalog.permissions);
      setAccessRequests(requests.requests);
      setAuditEvents(auditLog.events);
      setWhitelist(whitelistData);
      setOps(opsData);
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
    accessRequests,
    auditEvents,
    whitelist,
    ops,
    busy,
    error,
    output,
    setOutput,
    can,
    load
  };
}
