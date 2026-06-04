import { Activity, Command, UserCog } from "lucide-react";

export type PanelTab = "overview" | "commands" | "users";

type PanelTabsProps = {
  tab: PanelTab;
  canManageUsers: boolean;
  onChange: (tab: PanelTab) => void;
};

export function PanelTabs({ tab, canManageUsers, onChange }: PanelTabsProps) {
  return (
    <nav className="tabs">
      <button className={tab === "overview" ? "active" : ""} onClick={() => onChange("overview")}>
        <Activity size={17} /> Обзор
      </button>
      <button className={tab === "commands" ? "active" : ""} onClick={() => onChange("commands")}>
        <Command size={17} /> Команды
      </button>
      {canManageUsers && (
        <button className={tab === "users" ? "active" : ""} onClick={() => onChange("users")}>
          <UserCog size={17} /> Настройки
        </button>
      )}
    </nav>
  );
}
