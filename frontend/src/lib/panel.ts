import type { CommandDef, CommandParam, UserListItem } from "./types";

export const riskLabels: Record<CommandDef["riskLevel"], string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический"
};

export function commandParamEntries(command: CommandDef): Array<[string, CommandParam]> {
  return Object.entries(command.paramsSchema) as Array<[string, CommandParam]>;
}

export function buildCommandParams(
  command: CommandDef,
  currentValues: Record<string, string>,
  onlinePlayers: string[]
): Record<string, string> {
  const params: Record<string, string> = { ...currentValues };

  for (const [name, param] of commandParamEntries(command)) {
    if (param.type === "own_minecraft_username") continue;
    if (params[name]) continue;

    if (param.type === "minecraft_username" && onlinePlayers[0]) {
      params[name] = onlinePlayers[0];
    }
    if (param.type === "enum") {
      params[name] = param.default || param.values[0];
    }
    if (param.type === "string" && param.default) {
      params[name] = param.default;
    }
  }

  return params;
}

export function userLabel(user: UserListItem): string {
  return user.first_name || user.telegram_username || String(user.telegram_user_id);
}

export function statusLabel(status: string): string {
  if (status === "active") return "Активен";
  if (status === "pending") return "Заявка";
  if (status === "blocked") return "Отклонен";
  return status;
}

export function sameMinecraftName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
