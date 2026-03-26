import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activePath: string;
  title: string;
  subtitle?: string;
  teamName: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  userName: string;
  userEmail: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activePath,
  title,
  subtitle,
  teamName,
  plan,
  userName,
  userEmail,
}) => {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <Sidebar activePath={activePath} teamName={teamName} plan={plan} />

      {/* Header */}
      <Header title={title} subtitle={subtitle} userName={userName} userEmail={userEmail} />

      {/* Main Content Area */}
      <main className="ml-64 pt-16">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
};
