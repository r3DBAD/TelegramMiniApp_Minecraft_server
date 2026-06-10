import { ActionIcon, Badge, Button, Card, Group, Modal, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import {
  IconBan,
  IconCloud,
  IconCrown,
  IconDeviceFloppy,
  IconDeviceGamepad2,
  IconGauge,
  IconMapPin,
  IconMessage,
  IconPlayerPlay,
  IconSearch,
  IconShieldCheck,
  IconShieldX,
  IconStar,
  IconTerminal2,
  IconUserX,
  IconUsers
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import type { Dispatch, SetStateAction } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { api } from "../lib/api";
import { hapticImpact } from "../lib/haptics";
import { buildCommandParams, commandParamEntries, riskLabels } from "../lib/panel";
import type { CommandDef } from "../lib/types";

type CommandsPanelProps = {
  commands: CommandDef[];
  onlinePlayers: string[];
  onOutput: (text: string) => void;
};

type CommandValues = Record<string, Record<string, string>>;
type RiskFilter = "all" | "safe" | "medium" | "danger";
type HistoryItem = {
  id: string;
  source: "user" | "system";
  text: string;
  time: string;
};

export function CommandsPanel({ commands, onlinePlayers, onOutput }: CommandsPanelProps) {
  const [values, setValues] = useState<CommandValues>({});
  const [running, setRunning] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem("mcPanelFavorites") || "[]") as string[]));
  const [recent, setRecent] = useState<string[]>(() => JSON.parse(localStorage.getItem("mcPanelRecent") || "[]") as string[]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pendingCommand, setPendingCommand] = useState<CommandDef | null>(null);
  const deferredQuery = useDeferredValue(query);
  const available = commands.filter((command) => command.allowed).length;
  const filteredCommands = useMemo(
    () =>
      commands.filter((command) => {
        if (!command.allowed) return false;

        const haystack = `${command.title} ${command.description || ""} ${command.key}`.toLowerCase();
        const matchesQuery = haystack.includes(deferredQuery.trim().toLowerCase());
        const matchesRisk =
          riskFilter === "all" ||
          (riskFilter === "safe" && command.riskLevel === "low") ||
          (riskFilter === "medium" && command.riskLevel === "medium") ||
          (riskFilter === "danger" && ["high", "critical"].includes(command.riskLevel));

        return matchesQuery && matchesRisk;
      }),
    [commands, deferredQuery, riskFilter]
  );

  async function execute(command: CommandDef) {
    if (!command.allowed) return;
    hapticImpact(command.riskLevel === "critical" || command.riskLevel === "high" ? "heavy" : "light");
    if (command.confirmationRequired) {
      setPendingCommand(command);
      return;
    }

    await runCommand(command);
  }

  async function runCommand(command: CommandDef) {
    if (!command.allowed) return;

    const params = buildCommandParams(command, values[command.key] || {}, onlinePlayers);
    setRunning(command.key);
    pushHistory("user", `${command.key} ${Object.values(params).join(" ")}`.trim());

    try {
      const result = await api<{ output: string }>(`/commands/${command.key}/execute`, {
        method: "POST",
        body: JSON.stringify({ params, confirmed: true })
      });
      onOutput(result.output || "OK");
      pushHistory("system", result.output || "OK");
      rememberRecent(command.key);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка команды";
      onOutput(message);
      pushHistory("system", message);
    } finally {
      setRunning(null);
      setPendingCommand(null);
    }
  }

  function toggleFavorite(commandKey: string) {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(commandKey)) {
        next.delete(commandKey);
      } else {
        next.add(commandKey);
      }
      localStorage.setItem("mcPanelFavorites", JSON.stringify([...next]));
      return next;
    });
  }

  function rememberRecent(commandKey: string) {
    setRecent((current) => {
      const next = [commandKey, ...current.filter((key) => key !== commandKey)].slice(0, 5);
      localStorage.setItem("mcPanelRecent", JSON.stringify(next));
      return next;
    });
  }

  function pushHistory(source: HistoryItem["source"], text: string) {
    const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    setHistory((current) => [{ id: `${Date.now()}-${source}`, source, text, time }, ...current].slice(0, 8));
  }

  return (
    <motion.section className="command-list" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="glass-card section-card">
        <Group justify="space-between">
          <Stack gap={2}>
            <Text className="eyebrow">RCON allowlist</Text>
            <Title order={2}>Команды</Title>
          </Stack>
          <Badge className="neon-badge">{available}/{commands.length}</Badge>
        </Group>
      </Card>

      <Card className="glass-card command-toolbar">
        <TextInput
          leftSection={<IconSearch size={17} />}
          value={query}
          placeholder="Найти команду"
          autoComplete="off"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Group gap="xs" wrap="nowrap" className="filter-pills">
          <Button variant={riskFilter === "all" ? "light" : "subtle"} onClick={() => setRiskFilter("all")}>Все</Button>
          <Button variant={riskFilter === "safe" ? "light" : "subtle"} onClick={() => setRiskFilter("safe")}>Обычные</Button>
          <Button variant={riskFilter === "medium" ? "light" : "subtle"} onClick={() => setRiskFilter("medium")}>Средние</Button>
          <Button variant={riskFilter === "danger" ? "light" : "subtle"} color="red" onClick={() => setRiskFilter("danger")}>Опасные</Button>
        </Group>
      </Card>

      {history.length > 0 && (
        <Card className="glass-card command-history">
          {history.map((item) => (
            <div className={`chat-line ${item.source}`} key={item.id}>
              <span>{item.time}</span>
              <p>{item.source === "user" ? `Ты: ${item.text}` : `Система: ${item.text}`}</p>
            </div>
          ))}
        </Card>
      )}

      {(favorites.size > 0 || recent.length > 0) && (
        <Group className="quick-command-rail" gap="xs">
          {[...favorites, ...recent.filter((key) => !favorites.has(key))].slice(0, 6).map((key) => {
            const command = commands.find((item) => item.key === key && item.allowed);
            if (!command) return null;
            return (
              <Button variant="light" radius="xl" key={key} leftSection={favorites.has(key) ? <IconStar size={14} /> : null} onClick={() => execute(command)}>
                {command.title}
              </Button>
            );
          })}
        </Group>
      )}

      <SimpleGrid className="command-chip-grid" cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
        {filteredCommands.map((command) => (
          <CommandChip
            key={command.key}
            command={command}
            favorite={favorites.has(command.key)}
            onlinePlayers={onlinePlayers}
            running={running === command.key}
            values={values[command.key] || {}}
            onToggleFavorite={() => toggleFavorite(command.key)}
            onValue={(field, value) => setCommandValue(setValues, command.key, field, value)}
            onExecute={() => execute(command)}
          />
        ))}
      </SimpleGrid>

      {filteredCommands.length === 0 && (
        <Card className="glass-card empty-inline">
          <IconTerminal2 size={20} />
          <span>Команд по такому фильтру нет.</span>
        </Card>
      )}

      <Modal
        opened={Boolean(pendingCommand)}
        onClose={() => setPendingCommand(null)}
        title={pendingCommand?.title}
        centered
        classNames={{ content: "glass-modal" }}
      >
        {pendingCommand && (
          <Stack>
            <Text c="dimmed">{pendingCommand.description || "Команда будет выполнена через RCON."}</Text>
            <Badge className={`risk-badge ${pendingCommand.riskLevel}`}>{riskLabels[pendingCommand.riskLevel]}</Badge>
            <Group grow>
              <Button variant="light" onClick={() => setPendingCommand(null)}>Отмена</Button>
              <Button color="red" onClick={() => runCommand(pendingCommand)}>Выполнить</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </motion.section>
  );
}

function CommandChip({
  command,
  favorite,
  onlinePlayers,
  running,
  values,
  onToggleFavorite,
  onValue,
  onExecute
}: {
  command: CommandDef;
  favorite: boolean;
  onlinePlayers: string[];
  running: boolean;
  values: Record<string, string>;
  onToggleFavorite: () => void;
  onValue: (field: string, value: string) => void;
  onExecute: () => void;
}) {
  const params = commandParamEntries(command);
  const fieldCount = params.filter(([, param]) => param.type !== "own_minecraft_username").length;
  const needsOnlineSelect = params.some(([, param]) => param.type === "minecraft_username") && command.key.startsWith("tp.");
  const canRun = command.allowed && !(needsOnlineSelect && onlinePlayers.length === 0);
  const Icon = commandIcon(command.key);

  return (
    <Card className={`glass-card command-chip risk-${command.riskLevel}`}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div className="chip-icon"><Icon size={20} /></div>
        <ActionIcon variant="subtle" color={favorite ? "yellow" : "gray"} onClick={onToggleFavorite} aria-label="Избранное">
          <IconStar size={16} fill={favorite ? "currentColor" : "none"} />
        </ActionIcon>
      </Group>
      <Stack gap={5}>
        <Text fw={850} truncate>{command.title}</Text>
        <Text c="dimmed" size="xs" lineClamp={2}>{command.description || command.permissionKey}</Text>
        <Badge className={`risk-badge ${command.riskLevel}`}>{riskLabels[command.riskLevel]}</Badge>
      </Stack>

      {fieldCount > 0 && (
        <Stack gap={6}>
          {params.map(([name, param]) => {
            if (param.type === "own_minecraft_username") return null;
            if (param.type === "minecraft_username" && onlinePlayers.length > 0) {
              return (
                <Select
                  key={name}
                  aria-label={name}
                  size="xs"
                  data={onlinePlayers.map((player) => ({ value: player, label: player }))}
                  value={values[name] || onlinePlayers[0]}
                  onChange={(value) => onValue(name, value || "")}
                />
              );
            }
            if (param.type === "enum") {
              return (
                <Select
                  key={name}
                  aria-label={name}
                  size="xs"
                  data={param.values.map((value) => ({ value, label: value }))}
                  value={values[name] || param.default || param.values[0]}
                  onChange={(value) => onValue(name, value || "")}
                />
              );
            }
            return (
              <TextInput
                key={name}
                aria-label={name}
                size="xs"
                placeholder={name}
                defaultValue={param.type === "string" ? param.default || "" : ""}
                onChange={(event) => onValue(name, event.currentTarget.value)}
              />
            );
          })}
        </Stack>
      )}
      {needsOnlineSelect && onlinePlayers.length === 0 && <Text c="dimmed" size="xs">Нет игроков онлайн</Text>}

      <Button className="chip-run" leftSection={<IconPlayerPlay size={16} />} disabled={!canRun} loading={running} onClick={onExecute}>
        Run
      </Button>
    </Card>
  );
}

const commandIcons: Array<[string, Icon]> = [
  ["say", IconMessage],
  ["kick", IconUserX],
  ["ban", IconBan],
  ["pardon", IconShieldCheck],
  ["whitelist.add", IconShieldCheck],
  ["whitelist.remove", IconShieldX],
  ["op.", IconCrown],
  ["tp.", IconMapPin],
  ["gamemode", IconDeviceGamepad2],
  ["time", IconTerminal2],
  ["weather", IconCloud],
  ["difficulty", IconGauge],
  ["save", IconDeviceFloppy],
  ["raw", IconTerminal2],
  ["players", IconUsers]
];

function commandIcon(commandKey: string) {
  return commandIcons.find(([prefix]) => commandKey.startsWith(prefix))?.[1] || IconTerminal2;
}

function setCommandValue(
  setValues: Dispatch<SetStateAction<CommandValues>>,
  commandKey: string,
  field: string,
  value: string
) {
  setValues((current) => ({
    ...current,
    [commandKey]: {
      ...(current[commandKey] || {}),
      [field]: value
    }
  }));
}
