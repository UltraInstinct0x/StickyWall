"use client";

import { useSidebar } from "@/contexts/SidebarContext";

interface ResponsiveLayoutProps {
  children: React.ReactNode;
}

export function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  const { isCollapsed } = useSidebar();

  return (
    <div
      className={`
        transition-all duration-300 ease-out
        ${isCollapsed ? "md:ml-16" : "md:ml-64"}
        min-h-screen
      `}
    >
      {children}
    </div>
  );
}
