export interface PermissionDef {
  key: string;
  label: string;
  group: string;
}

// The catalog of every permission the app understands. This is the definition
// of *what permissions exist*; which roles/users hold them is stored in the DB
// and fully editable by admins. The UI is driven by this list (never hardcoded
// on the frontend).
export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: "dashboard.view", label: "View dashboard", group: "Dashboard" },

  { key: "properties.view", label: "View properties", group: "Masters" },
  { key: "properties.manage", label: "Manage properties", group: "Masters" },
  { key: "blocks.view", label: "View blocks", group: "Masters" },
  { key: "blocks.manage", label: "Manage blocks", group: "Masters" },
  { key: "floors.view", label: "View floors", group: "Masters" },
  { key: "floors.manage", label: "Manage floors", group: "Masters" },
  { key: "roomTypes.view", label: "View room types", group: "Masters" },
  { key: "roomTypes.manage", label: "Manage room types", group: "Masters" },
  { key: "rooms.view", label: "View rooms", group: "Masters" },
  { key: "rooms.manage", label: "Manage rooms", group: "Masters" },
  { key: "controlTypes.view", label: "View control types", group: "Masters" },
  {
    key: "controlTypes.manage",
    label: "Manage control types",
    group: "Masters",
  },
  { key: "processTypes.view", label: "View process types", group: "Masters" },
  {
    key: "processTypes.manage",
    label: "Manage process types",
    group: "Masters",
  },

  { key: "devices.view", label: "View devices", group: "Devices" },
  { key: "devices.manage", label: "Manage devices", group: "Devices" },
  { key: "controls.manage", label: "Configure device channels", group: "Devices" },

  { key: "users.view", label: "View users", group: "Administration" },
  { key: "users.manage", label: "Manage users", group: "Administration" },
  { key: "roles.view", label: "View roles", group: "Administration" },
  { key: "roles.manage", label: "Manage roles", group: "Administration" },

  {
    key: "integration.view",
    label: "View power automation integration",
    group: "Integration",
  },
  {
    key: "integration.manage",
    label: "Manage power automation integration",
    group: "Integration",
  },
  { key: "reports.view", label: "View reports", group: "Reports" },

  { key: "settings.view", label: "View software setup", group: "System" },
  {
    key: "settings.manage",
    label: "Manage software setup",
    group: "System",
  },

  { key: "smartTv.view", label: "View Smart TV branding", group: "Smart TV" },
  {
    key: "smartTv.manage",
    label: "Manage Smart TV branding",
    group: "Smart TV",
  },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.map(
  (p) => p.key,
);

const VIEW_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.map((p) => p.key).filter(
  (k) => k.endsWith(".view"),
);

// System roles seeded on first boot. Marked isSystem so they cannot be edited
// or deleted from the UI, but admins can freely create their own roles.
export const SYSTEM_ROLES: Array<{
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    name: "Administrator",
    description: "Full access to every module and setting.",
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    name: "Viewer",
    description: "Read-only access across all modules.",
    permissions: VIEW_PERMISSION_KEYS,
  },
];
