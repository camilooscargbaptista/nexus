import React from 'react';
import { User, Role } from '../../types';
import { Badge } from '../common/Badge';
import { X, Edit2 } from 'lucide-react';
import clsx from 'clsx';

interface MemberInfo {
  user: User;
  role: Role;
  joinedAt: string;
}

interface MemberListProps {
  members: MemberInfo[];
  currentUserRole: Role;
  onRoleChange?: (userId: string, newRole: Role) => void;
  onRemove?: (userId: string) => void;
}

const roleColors: Record<Role, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  OWNER: 'danger',
  ADMIN: 'warning',
  MEMBER: 'info',
  VIEWER: 'neutral',
};

const roleDisplayNames: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

const canManageRole = (currentRole: Role): boolean => {
  return currentRole === 'OWNER' || currentRole === 'ADMIN';
};

export const MemberList: React.FC<MemberListProps> = ({
  members,
  currentUserRole,
  onRoleChange,
  onRemove,
}) => {
  const [editingUserId, setEditingUserId] = React.useState<string | null>(null);
  const [selectedRole, setSelectedRole] = React.useState<Role | null>(null);

  const handleRoleChange = (userId: string, newRole: Role) => {
    onRoleChange?.(userId, newRole);
    setEditingUserId(null);
  };

  const canEdit = canManageRole(currentUserRole);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      {members.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-slate-500 dark:text-slate-400">No team members</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {members.map((member) => (
            <div
              key={member.user.id}
              className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Member Info */}
                  <div className="mb-3">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {member.user.name}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {member.user.email}
                    </p>
                  </div>

                  {/* Role Badge and Join Date */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {editingUserId === member.user.id && canEdit ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedRole || member.role}
                          onChange={(e) => setSelectedRole(e.target.value as Role)}
                          className="text-sm rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as Role[]).map((role) => (
                            <option key={role} value={role}>
                              {roleDisplayNames[role]}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() =>
                            handleRoleChange(
                              member.user.id,
                              selectedRole || member.role
                            )
                          }
                          className="px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded hover:bg-blue-600 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="px-2 py-1 bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-medium rounded hover:bg-slate-400 dark:hover:bg-slate-600 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <Badge
                          label={roleDisplayNames[member.role]}
                          variant={roleColors[member.role]}
                          size="sm"
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Joined {new Date(member.joinedAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {canEdit && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => {
                        setEditingUserId(member.user.id);
                        setSelectedRole(member.role);
                      }}
                      className={clsx(
                        'p-2 rounded-lg transition-colors',
                        editingUserId === member.user.id
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                      )}
                      title="Edit role"
                    >
                      <Edit2 size={16} />
                    </button>
                    {onRemove && (
                      <button
                        onClick={() => onRemove(member.user.id)}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                        title="Remove member"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
