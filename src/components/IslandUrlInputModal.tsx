'use client';

import type { ChangeEvent } from 'react';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface IslandUrlInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (islandName: string, url: string) => void;
  islandName: string;
  currentUrl: string;
}

export default function IslandUrlInputModal({ isOpen, onClose, onSave, islandName, currentUrl }: IslandUrlInputModalProps) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setUrl(currentUrl || '');
    }
  }, [isOpen, currentUrl]);

  const handleSave = () => {
    if (url.trim()) {
      try {
        // Basic URL validation
        new URL(url.trim());
        onSave(islandName, url.trim());
        onClose();
      } catch (_) {
        alert("Please enter a valid URL (e.g., https://example.com).");
        return;
      }
    } else {
      alert("URL cannot be empty.");
      return;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Provide URL for Island: {islandName}</DialogTitle>
          <DialogDescription>
            Enter the standardized URL for all entries related to <strong>{islandName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="island-url" className="text-right col-span-1">
              URL
            </Label>
            <Input
              id="island-url"
              value={url}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              className="col-span-3"
              placeholder="https://www.example.com/island-data.pdf"
            />
          </div>
           <p className="text-xs text-muted-foreground col-span-4 px-1">
            This URL will be used to fill missing URL fields for this island.
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSave}>
            Save URL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
