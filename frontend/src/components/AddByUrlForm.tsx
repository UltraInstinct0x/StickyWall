"use client";

import React, { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Plus, AlertCircle, Archive } from "lucide-react";
import { OEmbedUrlInput } from "./OEmbedUrlInput";
import { OEmbedData } from "./OEmbedPreview";

interface Wall {
  id: number;
  name: string;
  item_count: number;
  created_at: string;
}

interface AddByUrlFormProps {
  onAddItem: (url: string, wallId?: number) => Promise<void>;
  walls?: Wall[];
  selectedWall?: Wall | null;
  className?: string;
}

export function AddByUrlForm({ onAddItem, walls, selectedWall, className = "" }: AddByUrlFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [targetWallId, setTargetWallId] = useState<number | undefined>(selectedWall?.id);

  const handleAddUrl = async (url: string, oembedData?: OEmbedData) => {
    setError(null);
    setSuccess(null);

    if (!url || !url.startsWith("http")) {
      setError("Please enter a valid URL.");
      return;
    }

    startTransition(async () => {
      try {
        await onAddItem(url, targetWallId);
        const wallName = walls?.find(w => w.id === targetWallId)?.name || "your wall";
        setSuccess(
          oembedData
            ? `Added rich content from ${oembedData.provider_name || "web"} to ${wallName}`
            : `Added link to ${wallName}`,
        );

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add item.");
      }
    });
  };

  return (
    <div className={`space-y-3 sm:space-y-4 ${className}`}>
      {/* Success Message */}
      {success && (
        <Alert className="border-green-200 bg-green-50 animate-slide-up">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
              <Plus className="h-4 w-4 text-green-600" />
            </div>
            <AlertDescription className="text-green-700 font-medium">
              {success}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert className="border-red-200 bg-red-50 animate-slide-up">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
            <AlertDescription className="text-red-700 font-medium">
              {error}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Wall Selection */}
      {walls && walls.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="wall-select" className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Add to Wall
          </Label>
          <select
            id="wall-select"
            value={targetWallId?.toString() || ""}
            onChange={(e) => setTargetWallId(parseInt(e.target.value))}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select a wall</option>
            {walls.map((wall) => (
              <option key={wall.id} value={wall.id.toString()}>
                {wall.name} ({wall.item_count} items)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Clean URL Input for Modal */}
      <div className="space-y-4">
        <OEmbedUrlInput
          onAdd={handleAddUrl}
          placeholder="Paste a URL from YouTube, Twitter, Instagram, TikTok, etc..."
          buttonText={isPending ? "Adding..." : "Add to Wall"}
          showPreview={true}
          autoPreview={true}
          disabled={isPending}
        />
      </div>
    </div>
  );
}

export default AddByUrlForm;
