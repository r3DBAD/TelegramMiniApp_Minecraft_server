import { AlertTriangle, Command, Lock, Play, Search, Star } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useDeferredValue, useMemo, useState } from "react";

import { api } from "../lib/api";
import { buildCommandParams, commandParamEntries, riskLabels } from "../lib/panel";
import type { CommandDef } from "../lib/types";

type CommandsPanelProps = {
  commands: CommandDef[];
  onlinePlayers: string[];
  onOutput: (text: string) => void;
};

type CommandValues = Record<string, Record<string, string>>;
type RiskFilter = "all" | "safe" | "medium" | "danger";

export function CommandsPanel({ commands, onlinePlayers, onOutput }: CommandsPanelProps) {
  const [values, setValues] = useState<CommandValues>({});
  const [running, setRunning] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem("mcPanelFavorites") || "[]") as string[]));
  const [recent, setRecent] = useState<string[]>(() => JSON.parse(localStorage.getItem("mcPanelRecent") || "[]") as string[]);
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

    try {
      const result = await api<{ output: string }>(`/commands/${command.key}/execute`, {
        method: "POST",
        body: JSON.stringify({ params, confirmed: true })
      });
      onOutput(result.output || "OK");
      rememberRecent(command.key);
    } catch (err) {
      onOutput(err instanceof Error ? err.message : "Ошибка команды");
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

  return (
    <section className="command-list">
      <div className="section-head">
        <div>
          <p className="eyebrow">RCON allowlist</p>
          <h2>
            <Command size={18} /> Команды
          </h2>
        </div>
        <span>
          {available}/{commands.length} доступно
        </span>
      </div>

      <div className="command-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            name="commandSearch"
            value={query}
            placeholder="Найти команду…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-pills">
          <button className={riskFilter === "all" ? "active" : ""} aria-pressed={riskFilter === "all"} onClick={() => setRiskFilter("all")}>Все</button>
          <button className={riskFilter === "safe" ? "active" : ""} aria-pressed={riskFilter === "safe"} onClick={() => setRiskFilter("safe")}>Обычные</button>
          <button className={riskFilter === "medium" ? "active" : ""} aria-pressed={riskFilter === "medium"} onClick={() => setRiskFilter("medium")}>Средние</button>
          <button className={riskFilter === "danger" ? "active" : ""} aria-pressed={riskFilter === "danger"} onClick={() => setRiskFilter("danger")}>Опасные</button>
        </div>
      </div>

      {(favorites.size > 0 || recent.length > 0) && (
        <div className="quick-command-rail">
          {[...favorites, ...recent.filter((key) => !favorites.has(key))].slice(0, 6).map((key) => {
            const command = commands.find((item) => item.key === key && item.allowed);
            if (!command) return null;
            return (
              <button key={key} onClick={() => execute(command)}>
                {favorites.has(key) && <Star size={14} />}
                {command.title}
              </button>
            );
          })}
        </div>
      )}

      {filteredCommands.map((command) => {
        const params = commandParamEntries(command);
        const fieldCount = params.filter(([, param]) => param.type !== "own_minecraft_username").length;
        const needsOnlineSelect = params.some(([, param]) => param.type === "minecraft_username") && command.key.startsWith("tp.");
        const canRun = command.allowed && !(needsOnlineSelect && onlinePlayers.length === 0);

        return (
          <article className={`command-card risk-${command.riskLevel} ${!command.allowed ? "locked" : ""}`} key={command.key}>
            <div className="command-main">
              <div className="command-title">
                <h2>{command.title}</h2>
                <div className="command-title-actions">
                  <button
                    className={favorites.has(command.key) ? "favorite-button active" : "favorite-button"}
                    aria-label={favorites.has(command.key) ? "Убрать из избранного" : "Добавить в избранное"}
                    aria-pressed={favorites.has(command.key)}
                    onClick={() => toggleFavorite(command.key)}
                  >
                    <Star size={15} />
                  </button>
                  <span className={`risk-badge ${command.riskLevel}`}>
                    {command.riskLevel === "critical" && <AlertTriangle size={14} />}
                    {riskLabels[command.riskLevel]}
                  </span>
                </div>
              </div>
              <p>{command.description || command.permissionKey}</p>
            </div>

            <div className={fieldCount > 0 ? "command-fields" : "command-fields empty"}>
              {params.map(([name, param]) => {
                if (param.type === "own_minecraft_username") return null;
                if (param.type === "minecraft_username" && onlinePlayers.length > 0) {
                  return (
                    <select
                      key={name}
                      aria-label={name}
                      name={`${command.key}-${name}`}
                      autoComplete="off"
                      value={values[command.key]?.[name] || onlinePlayers[0]}
                      onChange={(event) => setCommandValue(setValues, command.key, name, event.target.value)}
                    >
                      {onlinePlayers.map((player) => (
                        <option key={player} value={player}>
                          {name}: {player}
                        </option>
                      ))}
                    </select>
                  );
                }
                if (param.type === "minecraft_username") {
                  return (
                    <input
                      key={name}
                      aria-label={name}
                      name={`${command.key}-${name}`}
                      placeholder={`${name}…`}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setCommandValue(setValues, command.key, name, event.target.value)}
                    />
                  );
                }
                if (param.type === "enum") {
                  return (
                    <select
                      key={name}
                      aria-label={name}
                      name={`${command.key}-${name}`}
                      autoComplete="off"
                      value={values[command.key]?.[name] || param.default || param.values[0]}
                      onChange={(event) => setCommandValue(setValues, command.key, name, event.target.value)}
                    >
                      {param.values.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  );
                }

                return (
                  <input
                    key={name}
                    aria-label={name}
                    name={`${command.key}-${name}`}
                    placeholder={`${name}…`}
                    autoComplete="off"
                    spellCheck={false}
                    defaultValue={param.default || ""}
                    onChange={(event) => setCommandValue(setValues, command.key, name, event.target.value)}
                  />
                );
              })}
              {fieldCount === 0 && <span>Параметры не нужны</span>}
              {needsOnlineSelect && onlinePlayers.length === 0 && <span className="field-hint">Нет игроков онлайн</span>}
            </div>

            <button className="run-button" disabled={!canRun || running === command.key} onClick={() => execute(command)}>
              {command.allowed ? <Play size={17} /> : <Lock size={17} />}
              {running === command.key ? "Выполняю…" : command.allowed ? "Выполнить" : "Нет доступа"}
            </button>
          </article>
        );
      })}

      {filteredCommands.length === 0 && (
        <div className="empty-inline">
          <Command size={20} />
          <span>Команд по такому фильтру нет.</span>
        </div>
      )}

      {pendingCommand && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setPendingCommand(null)}>
          <section className="confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="confirm-command-title" onClick={(event) => event.stopPropagation()}>
            <div>
              <p className="eyebrow">Подтверждение</p>
              <h2 id="confirm-command-title">{pendingCommand.title}</h2>
              <p>{pendingCommand.description || "Команда будет выполнена через RCON."}</p>
            </div>
            <div className={`risk-badge ${pendingCommand.riskLevel}`}>
              {riskLabels[pendingCommand.riskLevel]}
            </div>
            <div className="settings-actions two-columns">
              <button className="secondary-button" onClick={() => setPendingCommand(null)}>Отмена</button>
              <button className="danger-button" onClick={() => runCommand(pendingCommand)}>Выполнить</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
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
