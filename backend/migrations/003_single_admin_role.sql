BEGIN;

SET search_path TO mc_panel, public;

INSERT INTO roles (key, name, description, priority, is_system)
VALUES ('admin', 'Admin', 'Full access to the admin panel, bot admin commands and Minecraft controls.', 1000, true)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    priority = EXCLUDED.priority,
    is_system = true;

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
('raw', 'Raw RCON', 'Run an arbitrary RCON command.', 'minecraft.command.raw', '{command}', '{"command":{"type":"string","minLength":1,"maxLength":180}}', 'critical', true, 1000)
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

-- Preserve existing trusted operators: old owner/admin users become the single admin role.
INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT DISTINCT ur.user_id, admin_role.id, ur.granted_by
FROM user_roles ur
JOIN roles old_role ON old_role.id = ur.role_id
CROSS JOIN roles admin_role
WHERE old_role.key IN ('owner', 'admin')
  AND admin_role.key = 'admin'
ON CONFLICT DO NOTHING;

-- Active users without admin role are no longer allowed into the admin panel.
UPDATE users u
SET status = 'pending'
WHERE u.status = 'active'
  AND NOT EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id
        AND r.key = 'admin'
  );

DELETE FROM user_permission_overrides;

DELETE FROM user_roles ur
USING roles r
WHERE ur.role_id = r.id
  AND r.key <> 'admin';

DELETE FROM role_permissions;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'admin'
ON CONFLICT DO NOTHING;

DELETE FROM roles
WHERE key <> 'admin';

INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata)
VALUES (
    NULL,
    'system.single_admin_role',
    'migration',
    '003_single_admin_role',
    '{"note":"Roles collapsed to one admin role. Active non-admin users moved to pending."}'::jsonb
);

COMMIT;
