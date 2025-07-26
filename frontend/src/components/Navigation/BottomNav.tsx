'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  activeIcon: string;
  path: string;
}

const navItems: NavItem[] = [
  {
    id: 'home',
    label: 'Wall',
    icon: '🏠',
    activeIcon: '🏠',
    path: '/'
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: '🧭',
    activeIcon: '🧭',
    path: '/explore'
  },
  {
    id: 'search',
    label: 'Search',
    icon: '🔍',
    activeIcon: '🔍',
    path: '/search'
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: '👤',
    activeIcon: '👤',
    path: '/profile'
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    activeIcon: '⚙️',
    path: '/settings'
  }
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
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
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, [isAndroid]);

  const handleNavigation = (path: string) => {
    // Add haptic feedback for iOS
    if (isIOS && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }

    router.push(path);
  };

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
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
        fixed bottom-0 left-0 right-0 z-50
        ${isIOS
          ? 'bg-black/80 backdrop-blur-xl border-t border-gray-800'
          : 'bg-gray-900/95 backdrop-blur-sm border-t border-gray-700'
        }
        ${isVisible ? 'translate-y-0' : 'translate-y-full'}
        transition-transform duration-300 ease-in-out
      `}
      style={{
        paddingBottom: isIOS ? 'env(safe-area-inset-bottom)' : '0px',
      }}
    >
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const active = isActive(item.path);

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.path)}
              className={`
                flex flex-col items-center justify-center
                py-2 px-1 min-h-[60px] flex-1
                transition-all duration-200
                ${active
                  ? isIOS
                    ? 'text-blue-400'
                    : 'text-purple-400'
                  : 'text-gray-400 hover:text-gray-200'
                }
                ${isIOS ? 'active:scale-95' : 'active:scale-90'}
              `}
              aria-label={item.label}
            >
              <span className="text-xl mb-1">
                {active ? item.activeIcon : item.icon}
              </span>
              <span
                className={`
                  text-xs font-medium
                  ${isIOS ? 'tracking-tight' : 'tracking-normal'}
                `}
              >
                {item.label}
              </span>

              {/* iOS-style active indicator */}
              {isIOS && active && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-6 h-0.5 bg-blue-400 rounded-full" />
              )}

              {/* Android-style active indicator */}
              {isAndroid && active && (
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-purple-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* iOS-style home indicator */}
      {isIOS && (
        <div className="flex justify-center pt-1 pb-1">
          <div className="w-32 h-1 bg-gray-600 rounded-full" />
        </div>
      )}
    </nav>
  );
}
