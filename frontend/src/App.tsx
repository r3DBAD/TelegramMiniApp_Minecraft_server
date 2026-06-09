import { Shield, UserCog } from "lucide-react";
import { useState } from "react";

import { AccessRequestForm } from "./components/AccessRequestForm";
import { AppHeader } from "./components/AppHeader";
import { CommandsPanel } from "./components/CommandsPanel";
import { EmptyState } from "./components/EmptyState";
import { OverviewPanel } from "./components/OverviewPanel";
import { PanelTabs, type PanelTab } from "./components/PanelTabs";
import { UsersSettingsPanel } from "./components/UsersSettingsPanel";
import { usePanelData } from "./hooks/usePanelData";
import { hasTelegramInitData } from "./lib/api";

export default function App() {
  const [tab, setTab] = useState<PanelTab>("overview");
  const hasAuth = hasTelegramInitData();
  const { me, status, commands, users, permissionCatalog, accessRequests, auditEvents, whitelist, busy, error, output, setOutput, can, load } = usePanelData(hasAuth);

  if (!hasAuth) {
    return (
      <EmptyState icon={<Shield size={42} />} title="Minecraft Panel">
        <p>Открой панель из Telegram-бота.</p>
      </EmptyState>
    );
  }

  if (!me && busy) {
    return (
      <EmptyState icon={<Shield size={42} />} title="Загружаю панель">
        <p>Проверяю доступ и права.</p>
      </EmptyState>
    );
  }

  if (me?.user.status === "pending") {
    return (
      <EmptyState icon={<UserCog size={42} />} title="Доступ ожидает подтверждения">
        <p>ID: {me.user.telegramUserId}</p>
        <AccessRequestForm />
      </EmptyState>
    );
  }

  if (me?.user.status === "blocked") {
    return (
      <EmptyState icon={<Shield size={42} />} title="Доступ отклонен">
        <p>ID: {me.user.telegramUserId}</p>
      </EmptyState>
    );
  }

  return (
    <main className="shell">
      <AppHeader me={me} status={status} busy={busy} onRefresh={load} />

      {error && <div className="notice danger">{error}</div>}

      <PanelTabs tab={tab} canManageUsers={can.has("users.manage")} onChange={setTab} />

      {tab === "overview" && (
        <OverviewPanel me={me} status={status} commands={commands} output={output} onOutput={setOutput} />
      )}

      {tab === "commands" && (
        <CommandsPanel commands={commands} onlinePlayers={status?.players || []} onOutput={setOutput} />
      )}

      {tab === "users" && can.has("users.manage") && (
        <UsersSettingsPanel
          users={users}
          permissions={permissionCatalog}
          accessRequests={accessRequests}
          auditEvents={auditEvents}
          whitelist={whitelist}
          canManageRoles={can.has("roles.manage")}
          canManageWhitelist={can.has("minecraft.whitelist.write")}
          canReadAudit={can.has("audit.read")}
          onlinePlayers={status?.players || []}
          reload={load}
        />
      )}
    </main>
  );
}
