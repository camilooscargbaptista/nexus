import React, { useState } from 'react';
import { Bell, ChevronDown } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  userName: string;
  userEmail: string;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, userName, userEmail }) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const userInitials = userName
    .split(' ')
    .map((name) => name[0])
    .join('')
    .toUpperCase();

  return (
    <header className="fixed top-0 right-0 left-64 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-40">
      {/* Left - Title Section */}
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>

      {/* Right - Notification & User Menu */}
      <div className="flex items-center gap-4">
        {/* Notification Bell */}
        <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors relative">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-3 px-3 py-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {/* User Avatar */}
            <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center">
              <span className="text-xs font-semibold text-white">{userInitials}</span>
            </div>
            {/* User Name & Dropdown */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">{userName}</p>
                <p className="text-xs text-slate-500">{userEmail}</p>
              </div>
              <ChevronDown size={16} className="text-slate-400" />
            </div>
          </button>

          {/* Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-2">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900">{userName}</p>
                <p className="text-xs text-slate-500">{userEmail}</p>
              </div>
              <a
                href="#profile"
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Profile
              </a>
              <a
                href="#account"
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Account Settings
              </a>
              <a
                href="#help"
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Help & Support
              </a>
              <hr className="my-2" />
              <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
