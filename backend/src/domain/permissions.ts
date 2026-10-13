export const PERMISSIONS = [
  'visit:preregister',
  'visit:host',
  'visit:checkin',
  'visit:checkout',
  'visit:correct_departure',
  'visit:view_all',
  'audit:view',
  'messages:view',
  'user:manage',
  'role:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLES: Record<string, Permission[]> = {
  Employee: ['visit:preregister', 'visit:host'],
  'Front Desk': ['visit:checkin', 'visit:checkout', 'visit:correct_departure', 'visit:view_all'],
  Admin: [
    'visit:correct_departure',
    'visit:view_all',
    'audit:view',
    'messages:view',
    'user:manage',
    'role:manage',
  ],
};

/** Permissions the Admin role must always keep so nobody can be locked out. */
export const ADMIN_PROTECTED: Permission[] = ['user:manage', 'role:manage'];
