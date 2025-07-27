"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AddByUrlForm } from "@/components/AddByUrlForm";

interface Wall {
  id: number;
  name: string;
  item_count: number;
  created_at: string;
}

interface FloatingActionButtonProps {
  onAddItem: (url: string, wallId?: number) => Promise<void>;
  walls?: Wall[];
  selectedWall?: Wall | null;
}

export function FloatingActionButton({ onAddItem, walls, selectedWall }: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleAddItem = async (url: string, wallId?: number) => {
    await onAddItem(url, wallId);
    setIsOpen(false); // Close modal after successful add
  };

  return (
    <>
      {/* FAB Button */}
      <Button
        size="lg"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-warm-orange-500 hover:bg-warm-orange-600 text-white border-none md:bottom-8 md:right-8"
        onClick={() => setIsOpen(true)}
        aria-label="Add new content"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Modal Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Add New Content</DialogTitle>
            <DialogDescription>
              Share a link from anywhere on the web to add it to your wall
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4">
            <AddByUrlForm 
              onAddItem={handleAddItem}
              walls={walls}
              selectedWall={selectedWall}
              className="space-y-4"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}