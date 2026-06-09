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

const permissionLabels: Record<string, string> = {
  "minecraft.command.say": "Сообщение в чат",
  "minecraft.command.kick": "Кикнуть игрока",
  "minecraft.command.ban": "Забанить игрока",
  "minecraft.command.pardon": "Разбанить игрока",
  "minecraft.command.whitelist.add": "Добавить в whitelist",
  "minecraft.command.whitelist.remove": "Убрать из whitelist",
  "minecraft.whitelist.write": "Управление whitelist",
  "minecraft.command.op": "Выдать operator",
  "minecraft.command.deop": "Снять operator",
  "minecraft.ops.write": "Operator в Minecraft",
  "minecraft.command.tp.self_to_player": "Телепорт к игроку",
  "minecraft.command.tp.player_to_self": "Игрок ко мне",
  "minecraft.command.tp.player_to_player": "Игрок к игроку",
  "minecraft.command.time": "Время суток",
  "minecraft.command.weather": "Погода",
  "minecraft.command.gamemode": "Игровой режим",
  "minecraft.command.difficulty": "Сложность",
  "minecraft.command.save": "Сохранить мир",
  "minecraft.command.raw": "Raw RCON",
  "minecraft.status.read": "Статус сервера",
  "minecraft.whitelist.read": "Список whitelist",
  "users.manage": "Заявки и пользователи",
  "roles.manage": "Роли и права",
  "audit.read": "Журнал действий"
};

const auditLabels: Record<string, string> = {
  "users.status.update": "Статус пользователя изменен",
  "users.role.grant": "Выдана роль",
  "users.role.revoke": "Роль снята",
  "users.permission.override": "Изменено право",
  "users.minecraft_profile.set": "Привязан Minecraft ник",
  "minecraft.whitelist.add": "Игрок добавлен в whitelist",
  "minecraft.whitelist.remove": "Игрок удален из whitelist",
  "minecraft.command.execute": "Команда выполнена"
};

export function permissionLabel(permissionKey: string): string {
  return permissionLabels[permissionKey] || permissionKey.replace(/^minecraft\.command\./, "").replace(/\./g, " ");
}

export function auditActionLabel(action: string): string {
  return auditLabels[action] || action.replace(/_/g, " ");
}

export function sameMinecraftName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
