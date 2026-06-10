BEGIN;

CREATE SCHEMA IF NOT EXISTS mc_panel;
SET search_path TO mc_panel, public;

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    telegram_username TEXT,
    first_name TEXT,
    last_name TEXT,
    language_code TEXT,
    photo_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'blocked')),
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE minecraft_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    offline_uuid UUID,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX minecraft_profiles_username_uidx
    ON minecraft_profiles (lower(username));

CREATE TABLE roles (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    risk_level TEXT NOT NULL DEFAULT 'low'
        CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_permission_overrides (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
    reason TEXT,
    expires_at TIMESTAMPTZ,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE minecraft_servers (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE DEFAULT 'main',
    name TEXT NOT NULL,
    rcon_host TEXT NOT NULL DEFAULT 'minecraft',
    rcon_port INTEGER NOT NULL DEFAULT 25575,
    rcon_password_env TEXT NOT NULL DEFAULT 'RCON_PASSWORD',
    container_name TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE minecraft_commands (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON UPDATE CASCADE,
    rcon_template TEXT NOT NULL,
    params_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    risk_level TEXT NOT NULL DEFAULT 'low'
        CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    confirmation_required BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE command_executions (
    id BIGSERIAL PRIMARY KEY,
    server_id BIGINT REFERENCES minecraft_servers(id) ON DELETE SET NULL,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    command_key TEXT,
    permission_key TEXT,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    rendered_command TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'success', 'failed', 'denied')),
    output TEXT,
    error TEXT,
    request_ip INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE access_requests (
    id BIGSERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    telegram_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    requested_minecraft_username TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO minecraft_servers (key, name, rcon_host, rcon_port, rcon_password_env, container_name)
VALUES ('main', 'Community Server', 'minecraft', 25575, 'RCON_PASSWORD', 'minecraft')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (key, name, description, priority, is_system) VALUES
('owner', 'Owner', 'Full access including users, roles and critical server actions.', 1000, true),
('admin', 'Admin', 'Server administration without role ownership transfer.', 700, true),
('moderator', 'Moderator', 'Player moderation and common utility commands.', 400, true),
('player', 'Player', 'Basic Mini App access and own profile actions.', 100, true),
('viewer', 'Viewer', 'Read-only server status access.', 10, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (key, category, description, risk_level) VALUES
('system.view', 'system', 'Open the Mini App dashboard.', 'low'),
('users.manage', 'users', 'Approve, block and edit Telegram users.', 'critical'),
('roles.manage', 'users', 'Grant roles and individual permissions.', 'critical'),
('audit.read', 'audit', 'View command and security audit logs.', 'medium'),
('minecraft.status.view', 'minecraft', 'View server status.', 'low'),
('minecraft.players.view', 'minecraft', 'View online players.', 'low'),
('minecraft.whitelist.read', 'minecraft', 'View whitelist.', 'low'),
('minecraft.whitelist.write', 'minecraft', 'Add and remove whitelist entries.', 'high'),
('minecraft.ops.read', 'minecraft', 'View operators.', 'medium'),
('minecraft.ops.write', 'minecraft', 'Grant and revoke operator status.', 'critical'),
('minecraft.command.say', 'command', 'Send chat messages as the server.', 'low'),
('minecraft.command.kick', 'command', 'Kick players.', 'medium'),
('minecraft.command.ban', 'command', 'Ban players.', 'high'),
('minecraft.command.pardon', 'command', 'Unban players.', 'high'),
('minecraft.command.tp.self_to_player', 'command', 'Teleport yourself to another player.', 'medium'),
('minecraft.command.tp.player_to_self', 'command', 'Teleport a player to yourself.', 'high'),
('minecraft.command.tp.player_to_player', 'command', 'Teleport any player to any player.', 'high'),
('minecraft.command.gamemode', 'command', 'Change player game mode.', 'high'),
('minecraft.command.time', 'command', 'Change world time.', 'medium'),
('minecraft.command.weather', 'command', 'Change weather.', 'medium'),
('minecraft.command.difficulty', 'command', 'Change difficulty.', 'high'),
('minecraft.command.save', 'command', 'Force save the world.', 'medium'),
('minecraft.command.raw', 'command', 'Run an arbitrary RCON command.', 'critical'),
('server.lifecycle.restart', 'server', 'Restart the Minecraft container.', 'critical'),
('server.lifecycle.stop', 'server', 'Stop the Minecraft container.', 'critical')
ON CONFLICT (key) DO NOTHING;

INSERT INTO minecraft_commands
(key, title, description, permission_key, rcon_template, params_schema, risk_level, confirmation_required, sort_order)
VALUES
('say', 'Broadcast', 'Send a message to server chat.', 'minecraft.command.say', 'say {message}', '{"message":{"type":"string","minLength":1,"maxLength":200}}', 'low', false, 10),
('kick', 'Kick player', 'Kick a player from the server.', 'minecraft.command.kick', 'kick {player} {reason}', '{"player":{"type":"minecraft_username"},"reason":{"type":"string","maxLength":120,"default":"Kicked by admin"}}', 'medium', true, 20),
('ban', 'Ban player', 'Ban a player.', 'minecraft.command.ban', 'ban {player} {reason}', '{"player":{"type":"minecraft_username"},"reason":{"type":"string","maxLength":120,"default":"Banned by admin"}}', 'high', true, 30),
('pardon', 'Unban player', 'Remove player ban.', 'minecraft.command.pardon', 'pardon {player}', '{"player":{"type":"minecraft_username"}}', 'high', true, 40),
('whitelist.add', 'Add to whitelist', 'Allow player to join.', 'minecraft.whitelist.write', 'whitelist add {player}', '{"player":{"type":"minecraft_username"}}', 'high', true, 50),
('whitelist.remove', 'Remove from whitelist', 'Remove player from whitelist.', 'minecraft.whitelist.write', 'whitelist remove {player}', '{"player":{"type":"minecraft_username"}}', 'high', true, 60),
('op.add', 'Make operator', 'Grant Minecraft operator status.', 'minecraft.ops.write', 'op {player}', '{"player":{"type":"minecraft_username"}}', 'critical', true, 70),
('op.remove', 'Remove operator', 'Revoke Minecraft operator status.', 'minecraft.ops.write', 'deop {player}', '{"player":{"type":"minecraft_username"}}', 'critical', true, 80),
('tp.self_to_player', 'Teleport me to player', 'Teleport your linked Minecraft player to another player.', 'minecraft.command.tp.self_to_player', 'tp {self_player} {target}', '{"self_player":{"type":"own_minecraft_username"},"target":{"type":"minecraft_username"}}', 'medium', true, 90),
('tp.player_to_self', 'Teleport player to me', 'Teleport a player to your linked Minecraft player.', 'minecraft.command.tp.player_to_self', 'tp {player} {self_player}', '{"player":{"type":"minecraft_username"},"self_player":{"type":"own_minecraft_username"}}', 'high', true, 100),
('tp.player_to_player', 'Teleport player to player', 'Teleport any player to another player.', 'minecraft.command.tp.player_to_player', 'tp {player} {target}', '{"player":{"type":"minecraft_username"},"target":{"type":"minecraft_username"}}', 'high', true, 110),
('gamemode', 'Set game mode', 'Change player game mode.', 'minecraft.command.gamemode', 'gamemode {mode} {player}', '{"mode":{"type":"enum","values":["survival","creative","adventure","spectator"]},"player":{"type":"minecraft_username"}}', 'high', true, 120),
('time.set', 'Set time', 'Change world time.', 'minecraft.command.time', 'time set {time}', '{"time":{"type":"enum","values":["day","noon","night","midnight"]}}', 'medium', true, 130),
('weather', 'Set weather', 'Change weather.', 'minecraft.command.weather', 'weather {weather}', '{"weather":{"type":"enum","values":["clear","rain","thunder"]}}', 'medium', true, 140),
('difficulty', 'Set difficulty', 'Change server difficulty.', 'minecraft.command.difficulty', 'difficulty {difficulty}', '{"difficulty":{"type":"enum","values":["peaceful","easy","normal","hard"]}}', 'high', true, 150),
('save-all', 'Save world', 'Force world save.', 'minecraft.command.save', 'save-all flush', '{}', 'medium', true, 160)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    r.key = 'owner'
    OR (r.key = 'admin' AND p.key IN (
        'system.view', 'audit.read', 'minecraft.status.view', 'minecraft.players.view',
        'minecraft.whitelist.read', 'minecraft.whitelist.write',
        'minecraft.ops.read', 'minecraft.command.say', 'minecraft.command.kick',
        'minecraft.command.ban', 'minecraft.command.pardon',
        'minecraft.command.tp.self_to_player', 'minecraft.command.tp.player_to_self',
        'minecraft.command.tp.player_to_player', 'minecraft.command.gamemode',
        'minecraft.command.time', 'minecraft.command.weather', 'minecraft.command.difficulty',
        'minecraft.command.save'
    ))
    OR (r.key = 'moderator' AND p.key IN (
        'system.view', 'minecraft.status.view', 'minecraft.players.view',
        'minecraft.whitelist.read', 'minecraft.command.say', 'minecraft.command.kick',
        'minecraft.command.tp.self_to_player', 'minecraft.command.tp.player_to_self',
        'minecraft.command.time', 'minecraft.command.weather'
    ))
    OR (r.key = 'player' AND p.key IN (
        'system.view', 'minecraft.status.view', 'minecraft.players.view',
        'minecraft.command.tp.self_to_player'
    ))
    OR (r.key = 'viewer' AND p.key IN (
        'system.view', 'minecraft.status.view', 'minecraft.players.view'
    ))
)
ON CONFLICT DO NOTHING;

-- Replace 123456789 with your Telegram user id and run this block once
-- to create the first owner:
--
-- WITH u AS (
--     INSERT INTO mc_panel.users (telegram_user_id, telegram_username, first_name, status)
--     VALUES (123456789, 'your_username', 'Owner', 'active')
--     ON CONFLICT (telegram_user_id) DO UPDATE SET status = 'active'
--     RETURNING id
-- )
-- INSERT INTO mc_panel.user_roles (user_id, role_id)
-- SELECT u.id, r.id FROM u, mc_panel.roles r WHERE r.key = 'owner'
-- ON CONFLICT DO NOTHING;

COMMIT;
