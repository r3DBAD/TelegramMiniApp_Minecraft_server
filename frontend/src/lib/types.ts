export type MeResponse = {
  user: {
    id: number;
    telegramUserId: number;
    username?: string;
    firstName?: string;
    status: "pending" | "active" | "blocked";
    minecraftUsername?: string;
  };
  roles: string[];
  permissions: string[];
};

export type ServerStatus = {
  online: boolean;
  playersOnline: number | null;
  maxPlayers: number | null;
  players: string[];
  raw: string;
  latencyMs?: number | null;
  tps?: number | null;
  error?: string;
};

export type CommandDef = {
  key: string;
  title: string;
  description?: string;
  permissionKey: string;
  paramsSchema: Record<string, CommandParam>;
  riskLevel: "low" | "medium" | "high" | "critical";
  confirmationRequired: boolean;
  allowed: boolean;
};

export type CommandParam =
  | { type: "string"; minLength?: number; maxLength?: number; default?: string }
  | { type: "minecraft_username"; default?: string }
  | { type: "own_minecraft_username" }
  | { type: "enum"; values: string[]; default?: string };

export type UserListItem = {
  id: number;
  telegram_user_id: number;
  telegram_username?: string;
  first_name?: string;
  status: string;
  minecraft_username?: string;
  requested_minecraft_username?: string;
  roles: string[];
};

export type PermissionDef = {
  key: string;
  category: string;
  description: string;
  risk_level: "low" | "medium" | "high" | "critical";
};

export type UserPermissionState = PermissionDef & {
  role_keys: string[];
  override_effect?: "allow" | "deny";
  override_reason?: string;
  effective: boolean;
};

export type AccessRequestItem = {
  id: number;
  telegram_user_id: number;
  requested_minecraft_username?: string;
  status: string;
  created_at: string;
  user_id?: number;
  telegram_username?: string;
  first_name?: string;
  user_status?: string;
};

export type AuditEvent = {
  id: number;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata: Record<string, unknown> | string | null;
  created_at: string;
  telegram_username?: string;
  first_name?: string;
};

export type WhitelistEntry = {
  name?: string;
  uuid?: string;
};

export type WhitelistResponse = {
  raw: string;
  file: WhitelistEntry[];
};
