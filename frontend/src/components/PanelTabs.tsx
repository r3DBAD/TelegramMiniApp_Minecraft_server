import { UnstyledButton } from "@mantine/core";
import { IconActivityHeartbeat, IconTerminal2, IconUsersGroup } from "@tabler/icons-react";

export type PanelTab = "overview" | "commands" | "users";

type PanelTabsProps = {
  tab: PanelTab;
  canManageUsers: boolean;
  onChange: (tab: PanelTab) => void;
};

export function PanelTabs({ tab, canManageUsers, onChange }: PanelTabsProps) {
  const items = [
    { key: "overview" as const, label: "Мониторинг", icon: IconActivityHeartbeat, visible: true },
    { key: "commands" as const, label: "RCON", icon: IconTerminal2, visible: true },
    { key: "users" as const, label: "Доступ", icon: IconUsersGroup, visible: canManageUsers }
  ];

  return (
    <nav className="tabs">
      {items.filter((item) => item.visible).map((item) => {
        const Icon = item.icon;
        return (
          <UnstyledButton
            className={tab === item.key ? "active" : ""}
            key={item.key}
            aria-pressed={tab === item.key}
            onClick={() => onChange(item.key)}
          >
            <Icon size={20} stroke={1.8} />
            {item.label}
          </UnstyledButton>
        );
      })}
    </nav>
  );
}
