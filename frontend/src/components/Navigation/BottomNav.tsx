"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Compass, Search, User } from "lucide-react";

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

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const userAgent =
      navigator.userAgent || navigator.vendor || (window as any).opera;
    const iOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
    const android = /android/i.test(userAgent);

    setIsIOS(iOS);
    setIsAndroid(android);
  }, []);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          // Hide on scroll down, show on scroll up
          if (currentScrollY > lastScrollY && currentScrollY > 100) {
            setIsVisible(false);
          } else if (currentScrollY < lastScrollY) {
            setIsVisible(true);
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    // Only hide on scroll for Android (iOS should always show)
    if (isAndroid) {
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [isAndroid]);

  const handleNavigation = (path: string) => {
    // Add haptic feedback for iOS
    if (isIOS && "vibrate" in navigator) {
      navigator.vibrate(10);
    }

    router.push(path);
  };

  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(path);
  };

  // Don't render on Android if not visible
  if (isAndroid && !isVisible) {
    return null;
  }

  return (
    <nav
      className={`
        mobile-footer md:hidden
        ${
          isIOS
            ? "bg-background/95 backdrop-blur-xl border-t"
            : "bg-background/95 backdrop-blur-sm border-t"
        }
        ${isVisible ? "translate-y-0" : "translate-y-full"}
        transition-transform duration-300 ease-smooth
      `}
      style={{
        paddingBottom: isIOS ? "env(safe-area-inset-bottom)" : "0px",
      }}
    >
      <div className="flex items-center justify-around px-2">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const IconComponent = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.path)}
              className={`
                nav-item touch-target
                flex flex-col items-center justify-center
                py-2 px-3 min-h-[60px] flex-1 rounded-lg
                transition-all duration-200 interactive-feedback
                ${
                  active
                    ? "text-warm-orange-600 bg-warm-orange-100/60"
                    : "text-muted-foreground hover:text-warm-orange-700 hover:bg-warm-orange-50"
                }
              `}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <IconComponent
                className={`
                  w-5 h-5 mb-1 transition-all duration-200
                  ${active ? "scale-110" : "scale-100"}
                `}
              />
              <span
                className={`
                  text-xs font-medium tracking-tight
                  ${active ? "text-warm-orange-600" : ""}
                `}
              >
                {item.label}
              </span>

              {/* iOS-style active indicator */}
              {isIOS && active && (
                <div
                  className="absolute top-1 left-1/2 transform -translate-x-1/2
                           w-6 h-1 bg-warm-orange-500 rounded-full animate-scale-in"
                />
              )}

              {/* Android-style active indicator */}
              {isAndroid && active && (
                <div
                  className="absolute bottom-1 left-1/2 transform -translate-x-1/2
                           w-8 h-1 bg-warm-orange-500 rounded-full animate-scale-in"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* iOS-style home indicator */}
      {isIOS && (
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-32 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
      )}
    </nav>
  );
}
