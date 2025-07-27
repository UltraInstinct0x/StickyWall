"use client";

import { Suspense } from "react";
import { InstallPrompt } from "@/components/InstallPrompt";
import { HomeContent } from "@/components/HomeContent";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function Home() {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <header className="mobile-header">
        <div className="content-container py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Digital Wall</h1>
              <p className="text-sm sm:text-base text-muted-foreground">Your context curation network</p>
            </div>
            {/* Mobile-friendly quick action could go here */}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="content-container py-3 sm:py-6">
        <InstallPrompt />

        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-64">
              <LoadingSpinner />
            </div>
          }
        >
          <HomeContent />
        </Suspense>
      </main>
    </div>
  );
}
