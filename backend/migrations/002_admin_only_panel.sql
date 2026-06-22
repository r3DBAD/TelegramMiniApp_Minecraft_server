BEGIN;

SET search_path TO mc_panel, public;

-- Admin-only mode:
-- viewer/player/moderator keep their role records for history, but lose Mini App permissions.
DELETE FROM role_permissions rp
USING roles r
WHERE rp.role_id = r.id
  AND r.key IN ('viewer', 'player', 'moderator');

INSERT INTO permissions (key, category, description, risk_level) VALUES
('minecraft.command.diagnostics', 'command', 'Run TPS, MSPT and spark diagnostics.', 'low'),
('minecraft.command.plugins', 'command', 'List loaded plugins.', 'medium'),
('minecraft.command.paper', 'command', 'Run Paper diagnostic commands.', 'medium')
ON CONFLICT (key) DO UPDATE SET
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    risk_level = EXCLUDED.risk_level;

INSERT INTO minecraft_commands
(key, title, description, permission_key, rcon_template, params_schema, risk_level, confirmation_required, sort_order)
VALUES
('diagnostics.tps', 'TPS', 'Show server TPS for the last 1, 5 and 15 minutes.', 'minecraft.command.diagnostics', 'tps', '{}', 'low', false, 5),
('diagnostics.mspt', 'MSPT', 'Show tick time stats. Keep average below 50ms for stable 20 TPS.', 'minecraft.command.diagnostics', 'mspt', '{}', 'low', false, 6),
('diagnostics.spark', 'Spark health', 'Run spark healthreport when spark is installed.', 'minecraft.command.diagnostics', 'spark healthreport', '{}', 'medium', false, 7),
('plugins.list', 'Plugins', 'List loaded plugins and spot failed or legacy entries.', 'minecraft.command.plugins', 'plugins', '{}', 'medium', false, 8),
('paper.chunkinfo', 'Chunk info', 'Show loaded chunk counts across worlds.', 'minecraft.command.paper', 'paper chunkinfo *', '{}', 'medium', false, 9),
('raw', 'Raw RCON', 'Run an arbitrary RCON command. Owner only by default.', 'minecraft.command.raw', '{command}', '{"command":{"type":"string","minLength":1,"maxLength":180}}', 'critical', true, 1000)
ON CONFLICT (key) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    permission_key = EXCLUDED.permission_key,
    rcon_template = EXCLUDED.rcon_template,
    params_schema = EXCLUDED.params_schema,
    risk_level = EXCLUDED.risk_level,
    confirmation_required = EXCLUDED.confirmation_required,
    sort_order = EXCLUDED.sort_order,
    enabled = true;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    r.key = 'owner'
    OR (r.key = 'admin' AND p.key IN (
        'system.view',
        'users.manage',
        'audit.read',
        'minecraft.status.view',
        'minecraft.players.view',
        'minecraft.whitelist.read',
        'minecraft.whitelist.write',
        'minecraft.ops.read',
        'minecraft.command.say',
        'minecraft.command.kick',
        'minecraft.command.ban',
        'minecraft.command.pardon',
        'minecraft.command.tp.self_to_player',
        'minecraft.command.tp.player_to_self',
        'minecraft.command.tp.player_to_player',
        'minecraft.command.gamemode',
        'minecraft.command.time',
        'minecraft.command.weather',
        'minecraft.command.difficulty',
        'minecraft.command.save',
        'minecraft.command.diagnostics',
        'minecraft.command.plugins',
        'minecraft.command.paper'
    ))
)
ON CONFLICT DO NOTHING;

INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata)
VALUES (
    NULL,
    'system.admin_only_mode',
    'migration',
    '002_admin_only_panel',
    '{"note":"Mini App access moved to owner/admin roles; player/viewer/moderator permissions removed."}'::jsonb
);

COMMIT;
