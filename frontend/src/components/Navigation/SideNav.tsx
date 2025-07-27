"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Compass, Search, User, Plus, Settings } from "lucide-react";
import { useSidebar } from "@/contexts/SidebarContext";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const navItems: NavItem[] = [
  {
    id: "home",
    label: "Wall",
    icon: Home,
    path: "/",
  },
  {
    id: "explore",
    label: "Explore",
    icon: Compass,
    path: "/explore",
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
    path: "/search",
  },
  {
    id: "profile",
    label: "Profile",
    icon: User,
    path: "/profile",
  },
];

export function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, toggleSidebar } = useSidebar();

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(path);
  };

  return (
    <nav
      className={`
        hidden md:flex flex-col
        fixed left-0 top-0 h-full
        bg-white/95 backdrop-blur-xl border-r border-neutral-200
        transition-all duration-300 ease-out z-40
        ${isCollapsed ? "w-16" : "w-64"}
      `}
    >
      {/* Header */}
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div>
              <h1 className="text-lg font-bold text-neutral-900">
                Digital Wall
              </h1>
              <p className="text-xs text-neutral-500">Your content hub</p>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <div
              className={`w-4 h-4 transition-transform ${isCollapsed ? "rotate-180" : ""}`}
            >
              ←
            </div>
          </button>
        </div>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 py-4">
        <div className="space-y-1 px-3">
          {navItems.map((item) => {
            const active = isActive(item.path);
            const IconComponent = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.path)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  transition-all duration-200 text-left
                  ${
                    active
                      ? "bg-warm-orange-100 text-warm-orange-700 shadow-sm"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  }
                `}
                title={isCollapsed ? item.label : undefined}
              >
                <IconComponent
                  className={`
                    w-5 h-5 flex-shrink-0 transition-all duration-200
                    ${active ? "text-warm-orange-600" : ""}
                  `}
                />
                {!isCollapsed && (
                  <span className="font-medium text-sm">{item.label}</span>
                )}
                {active && !isCollapsed && (
                  <div className="ml-auto w-2 h-2 bg-warm-orange-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Add Content Button */}
        <div className="px-3 mt-6">
          <button
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
              bg-warm-orange-500 text-white hover:bg-warm-orange-600
              transition-all duration-200 shadow-sm
              ${isCollapsed ? "justify-center" : ""}
            `}
            title={isCollapsed ? "Add Content" : undefined}
          >
            <Plus className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && (
              <span className="font-medium text-sm">Add Content</span>
            )}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-neutral-200">
        <button
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
            text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900
            transition-all duration-200
            ${isCollapsed ? "justify-center" : ""}
          `}
          title={isCollapsed ? "Settings" : undefined}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && (
            <span className="font-medium text-sm">Settings</span>
          )}
        </button>
      </div>
    </nav>
  );
}
