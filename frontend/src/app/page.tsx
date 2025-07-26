import { Suspense } from "react";
import { InstallPrompt } from "@/components/InstallPrompt";
import { HomeContent } from "@/components/HomeContent";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <InstallPrompt />

      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <LoadingSpinner />
          </div>
        }
      >
        <HomeContent />
      </Suspense>
    </div>
  );
}
