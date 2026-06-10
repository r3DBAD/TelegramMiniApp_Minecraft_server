import { ActionIcon, Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import {
  IconCheck,
  IconCloud,
  IconCopy,
  IconDeviceFloppy,
  IconDeviceGamepad2,
  IconHeartRateMonitor,
  IconServer2,
  IconSunHigh,
  IconUsers
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../lib/api";
import { hapticImpact } from "../lib/haptics";
import { sameMinecraftName } from "../lib/panel";
import type { CommandDef, MeResponse, ServerStatus } from "../lib/types";

type OverviewPanelProps = {
  me: MeResponse | null;
  status: ServerStatus | null;
  commands: CommandDef[];
  output: string;
  onOutput: (text: string) => void;
};

type QuickAction = {
  key: string;
  label: string;
  icon: "sun" | "weather" | "save";
  params: Record<string, string>;
};

const quickActions: QuickAction[] = [
  { key: "time.set", label: "День", icon: "sun", params: { time: "day" } },
  { key: "weather", label: "Ясно", icon: "weather", params: { weather: "clear" } },
  { key: "save-all", label: "Сохранить", icon: "save", params: {} }
];

export function OverviewPanel({ me, status, commands, output, onOutput }: OverviewPanelProps) {
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const minecraftUsername = me?.user.minecraftUsername;
  const serverAddress = import.meta.env.VITE_MINECRAFT_SERVER_ADDRESS || window.location.host;
  const serverVersion = import.meta.env.VITE_MINECRAFT_VERSION || "Java Edition";
  const playersOnline = status?.playersOnline ?? 0;
  const maxPlayers = status?.maxPlayers ?? 0;
  const tpsValue = status?.tps == null ? "N/A" : status.tps.toFixed(status.tps % 1 === 0 ? 0 : 1);
  const latencyValue = status?.latencyMs == null ? "N/A" : `${status.latencyMs}ms`;
  const fillPercent = maxPlayers > 0 ? Math.min(100, Math.round((playersOnline / maxPlayers) * 100)) : 0;
  const isOnline = Boolean(
    minecraftUsername && status?.players.some((player) => sameMinecraftName(player, minecraftUsername))
  );
  const availableQuickActions = useMemo(
    () =>
      quickActions
        .map((action) => ({ ...action, command: commands.find((command) => command.key === action.key && command.allowed) }))
        .filter((action): action is QuickAction & { command: CommandDef } => Boolean(action.command)),
    [commands]
  );

  async function runQuickAction(action: QuickAction) {
    hapticImpact(action.key === "save-all" ? "medium" : "light");
    setRunningAction(action.key);
    try {
      const result = await api<{ output: string }>(`/commands/${action.key}/execute`, {
        method: "POST",
        body: JSON.stringify({ params: action.params, confirmed: true })
      });
      onOutput(result.output || "OK");
    } catch (err) {
      onOutput(err instanceof Error ? err.message : "Ошибка команды");
    } finally {
      setRunningAction(null);
    }
  }

  async function copyAddress() {
    await navigator.clipboard?.writeText(serverAddress);
    hapticImpact("light");
    onOutput("Адрес скопирован");
  }

  return (
    <motion.section className="overview-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="glass-card hero-dashboard">
        <Group justify="space-between" align="flex-start">
          <Group gap="md">
            <div className={status?.online ? "server-orb online" : "server-orb"} aria-hidden="true" />
            <Stack gap={3}>
              <Text c="dimmed" size="sm">Сервер</Text>
              <Title order={1}>{status?.online ? "Online" : "RCON offline"}</Title>
              <Text c="dimmed" size="xs">{status?.online ? "RCON отвечает" : "Проверь RCON доступ"}</Text>
            </Stack>
          </Group>
          <Badge className={status?.online ? "neon-badge" : "danger-badge"}>{playersOnline}/{status?.maxPlayers ?? "?"}</Badge>
        </Group>

        <Stack gap={8} mt="xl">
          <Group justify="space-between">
            <Text fw={700}>Игроки онлайн</Text>
            <Text c="dimmed">{playersOnline}/{status?.maxPlayers ?? "?"}</Text>
          </Group>
          <Progress value={fillPercent} size="lg" radius="xl" className="neon-progress" animated={status?.online} />
        </Stack>

        <div className="player-head-marquee">
          {(status?.players || []).map((player) => (
            <img key={player} src={minecraftHead(player, 48)} alt={player} title={player} loading="lazy" />
          ))}
          {status?.players.length === 0 && <span>Пусто</span>}
        </div>
      </Card>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <MetricCard icon={<IconHeartRateMonitor size={19} />} label="TPS" value={status?.online ? tpsValue : "N/A"} tone="green" />
        <MetricCard icon={<IconServer2 size={19} />} label="Latency" value={status?.online ? latencyValue : "N/A"} tone="purple" />
        <MetricCard icon={<IconDeviceGamepad2 size={19} />} label="Ник" value={minecraftUsername || "Не привязан"} tone="purple" />
        <MetricCard icon={<IconUsers size={19} />} label="Твой статус" value={isOnline ? "Online" : "Offline"} tone={isOnline ? "green" : "red"} />
      </SimpleGrid>

      <Card className="glass-card server-copy-card">
        <Stack gap={2}>
          <Text c="dimmed" size="sm">Адрес сервера</Text>
          <Text fw={800}>{serverAddress}</Text>
          <Text c="dimmed" size="xs">{serverVersion}</Text>
        </Stack>
        <ActionIcon variant="light" color="green" size="lg" onClick={copyAddress} aria-label="Скопировать адрес">
          <IconCopy size={18} />
        </ActionIcon>
      </Card>

      {availableQuickActions.length > 0 && (
        <Card className="glass-card">
          <Group justify="space-between" mb="md">
            <Title order={2}>Быстрые действия</Title>
            <IconCheck size={18} color="#00ff85" />
          </Group>
          <SimpleGrid cols={2} spacing="sm">
            {availableQuickActions.map((action) => (
              <Button
                className="half-action"
                key={action.key}
                loading={runningAction === action.key}
                leftSection={quickIcon(action.icon)}
                onClick={() => runQuickAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </SimpleGrid>
        </Card>
      )}

      {output && (
        <Card className="glass-card command-output-card">
          <Group gap="xs" mb="xs">
            <IconCheck size={18} color="#00ff85" />
            <Title order={2}>Ответ сервера</Title>
          </Group>
          <pre>{output}</pre>
        </Card>
      )}
    </motion.section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "green" | "purple" | "red";
}) {
  return (
    <Card className={`glass-card metric-card tone-${tone}`}>
      <Group gap="xs">
        {icon}
        <Text c="dimmed" size="xs">{label}</Text>
      </Group>
      <Text fw={850} size="lg" truncate>{value}</Text>
    </Card>
  );
}

function quickIcon(icon: QuickAction["icon"]) {
  if (icon === "sun") return <IconSunHigh size={18} />;
  if (icon === "weather") return <IconCloud size={18} />;
  return <IconDeviceFloppy size={18} />;
}

function minecraftHead(username: string, size: number) {
  return `https://minotar.net/helm/${encodeURIComponent(username)}/${size}.png`;
}
