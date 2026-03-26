import React from 'react';
import {
  LayoutDashboard,
  AlertTriangle,
  GitBranch,
  Users,
  Settings,
} from 'lucide-react';

export type SidebarNavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
};

interface SidebarProps {
  activePath: string;
  teamName: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
}

const navItems: SidebarNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
  { id: 'findings', label: 'Findings', icon: <AlertTriangle size={20} />, path: '/findings' },
  { id: 'pipeline', label: 'Pipeline', icon: <GitBranch size={20} />, path: '/pipeline' },
  { id: 'team', label: 'Team', icon: <Users size={20} />, path: '/team' },
  { id: 'settings', label: 'Settings', icon: <Settings size={20} />, path: '/settings' },
];

const planColors: Record<string, string> = {
  FREE: 'bg-slate-100 text-slate-700',
  PRO: 'bg-blue-100 text-blue-700',
  ENTERPRISE: 'bg-amber-100 text-amber-700',
};

export const Sidebar: React.FC<SidebarProps> = ({ activePath, teamName, plan }) => {
  return (
    <div className="fixed left-0 top-0 w-64 h-screen bg-white border-r border-slate-200 flex flex-col">
      {/* Logo Section */}
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="text-xl font-bold text-slate-900">
            Nexus<span className="text-amber-500">Cloud</span>
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-2">{teamName}</p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activePath === item.path;
          return (
            <a
              key={item.id}
              href={item.path}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                ${
                  isActive
                    ? 'bg-amber-50 text-amber-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }
              `}
            >
              <span className={isActive ? 'text-amber-500' : 'text-slate-400'}>
                {item.icon}
              </span>
              <span className="text-sm font-medium">{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* Plan Badge */}
      <div className="px-4 py-6 border-t border-slate-200">
        <div
          className={`
            px-3 py-2 rounded-lg text-xs font-semibold text-center
            ${planColors[plan] || planColors.FREE}
          `}
        >
          {plan} Plan
        </div>
      </div>
    </div>
  );
};
