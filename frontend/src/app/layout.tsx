import "./globals.css";
import type { Metadata } from "next";
import { BottomNav } from "@/components/Navigation/BottomNav";
import { SideNav } from "@/components/Navigation/SideNav";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

export const metadata: Metadata = {
  title: "Digital Wall - Your Smart Content Hub",
  description:
    "Collect, organize, and discover your shared content with AI-powered insights",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Digital Wall",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <SidebarProvider>
          <div
            id="app"
            className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900"
          >
            <SideNav />
            <ResponsiveLayout>{children}</ResponsiveLayout>
            <BottomNav />
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}
