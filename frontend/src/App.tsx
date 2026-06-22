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
import { hapticNotify } from "./lib/haptics";

type ToastState = {
  text: string;
  tone: "success" | "danger" | "info";
};

export default function App() {
  const [tab, setTab] = useState<PanelTab>("overview");
  const [toast, setToast] = useState<ToastState | null>(null);
  const hasAuth = hasTelegramInitData();
  const { me, status, commands, users, permissionCatalog, accessRequests, auditEvents, whitelist, ops, busy, error, output, setOutput, can, load } = usePanelData(hasAuth);
  const hasAdminAccess = Boolean(me?.roles.includes("admin"));

  function notify(text: string, tone: ToastState["tone"] = "info") {
    const isError = tone === "danger" || /ошибка|error|unavailable|denied|forbidden/i.test(text);
    const finalTone = isError ? "danger" : tone;
    setToast({ text: text.length > 90 ? "Команда выполнена" : text, tone: finalTone });
    hapticNotify(finalTone === "danger" ? "error" : "success");
    window.setTimeout(() => setToast(null), 2600);
  }

  function handleOutput(text: string) {
    setOutput(text);
    notify(text, "success");
  }

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

  if (me?.user.status === "active" && !hasAdminAccess) {
    return (
      <EmptyState icon={<Shield size={42} />} title="Только для администраторов">
        <p>Эта панель открывается только пользователям с единственной ролью admin.</p>
      </EmptyState>
    );
  }

  return (
    <main className="shell">
      <AppHeader me={me} status={status} busy={busy} onRefresh={load} />

      {error && <div className="notice danger">{error}</div>}
      {toast && <div className={`toast ${toast.tone}`} role="status">{toast.text}</div>}

      <PanelTabs tab={tab} canManageUsers={can.has("users.manage")} onChange={setTab} />

      {tab === "overview" && (
        <OverviewPanel status={status} commands={commands} ops={ops} auditEvents={auditEvents} output={output} onOutput={handleOutput} />
      )}

      {tab === "commands" && (
        <CommandsPanel commands={commands} onlinePlayers={status?.players || []} onOutput={handleOutput} />
      )}

      {tab === "users" && can.has("users.manage") && (
        <UsersSettingsPanel
          users={users}
          permissions={permissionCatalog}
          accessRequests={accessRequests}
          auditEvents={auditEvents}
          whitelist={whitelist}
          ops={ops}
          currentUserId={me?.user.id}
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
