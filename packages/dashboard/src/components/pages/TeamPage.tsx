import React from 'react';
import { User, Role, Team } from '../../types';
import { MemberList } from '../team/MemberList';

interface MemberInfo {
  user: User;
  role: Role;
  joinedAt: string;
}

interface TeamPageProps {
  members: MemberInfo[];
  team: Team;
  currentUserRole: Role;
  onRoleChange?: (userId: string, newRole: Role) => void;
  onRemove?: (userId: string) => void;
}

export const TeamPage: React.FC<TeamPageProps> = ({
  members,
  team,
  currentUserRole,
  onRoleChange,
  onRemove,
}) => {
  return (
    <div className="space-y-6">
      {/* Team Header */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Team Name</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {team.name}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Slug</p>
            <p className="font-mono text-slate-700 dark:text-slate-300">{team.slug}</p>
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Plan</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {team.plan}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Members</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {members.length}
            </p>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Created {new Date(team.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Members Section */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">
          Team Members
        </h2>
        <MemberList
          members={members}
          currentUserRole={currentUserRole}
          onRoleChange={onRoleChange}
          onRemove={onRemove}
        />
      </div>

      {/* Invite Section */}
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Invite New Members
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
          Share this team's invite link with new members to get started.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/invite/${team.slug}`}
            className="flex-1 px-4 py-2 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-sm"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/invite/${team.slug}`
              );
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors"
          >
            Copy Link
          </button>
        </div>
      </div>
    </div>
  );
};
