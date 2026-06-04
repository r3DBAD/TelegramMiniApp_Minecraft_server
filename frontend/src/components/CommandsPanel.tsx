import { AlertTriangle, Command } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import { api } from "../lib/api";
import { buildCommandParams, commandParamEntries, riskLabels } from "../lib/panel";
import type { CommandDef } from "../lib/types";

type CommandsPanelProps = {
  commands: CommandDef[];
  onlinePlayers: string[];
  onOutput: (text: string) => void;
};

type CommandValues = Record<string, Record<string, string>>;

export function CommandsPanel({ commands, onlinePlayers, onOutput }: CommandsPanelProps) {
  const [values, setValues] = useState<CommandValues>({});
  const [running, setRunning] = useState<string | null>(null);
  const available = commands.filter((command) => command.allowed).length;

  async function execute(command: CommandDef) {
    if (!command.allowed) return;
    if (command.confirmationRequired && !confirm(`${command.title}?`)) return;

    const params = buildCommandParams(command, values[command.key] || {}, onlinePlayers);
    setRunning(command.key);

    try {
      const result = await api<{ output: string }>(`/commands/${command.key}/execute`, {
        method: "POST",
        body: JSON.stringify({ params, confirmed: true })
      });
      onOutput(result.output || "OK");
    } catch (err) {
      onOutput(err instanceof Error ? err.message : "Ошибка команды");
    } finally {
      setRunning(null);
    }
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

      {commands.map((command) => {
        const params = commandParamEntries(command);
        const fieldCount = params.filter(([, param]) => param.type !== "own_minecraft_username").length;

        return (
          <article className={`command-row risk-${command.riskLevel} ${!command.allowed ? "locked" : ""}`} key={command.key}>
            <div className="command-main">
              <div className="command-title">
                <h2>{command.title}</h2>
                <span className={`risk-badge ${command.riskLevel}`}>
                  {command.riskLevel === "critical" && <AlertTriangle size={14} />}
                  {riskLabels[command.riskLevel]}
                </span>
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
                if (param.type === "enum") {
                  return (
                    <select
                      key={name}
                      aria-label={name}
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
                    placeholder={name}
                    defaultValue={param.default || ""}
                    onChange={(event) => setCommandValue(setValues, command.key, name, event.target.value)}
                  />
                );
              })}
              {fieldCount === 0 && <span>Параметры не нужны</span>}
              {fieldCount > 0 && onlinePlayers.length === 0 && command.key.startsWith("tp.") && <span>Нет игроков онлайн</span>}
            </div>

            <button className="run-button" disabled={!command.allowed || running === command.key} onClick={() => execute(command)}>
              {running === command.key ? "..." : command.allowed ? "Выполнить" : "Нет доступа"}
            </button>
          </article>
        );
      })}
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
