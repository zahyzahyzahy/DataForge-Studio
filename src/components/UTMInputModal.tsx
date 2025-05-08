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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RowForUTMInput, UTMZone } from '@/types/data';

interface UTMInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (utmZone: UTMZone | string) => void; // Can be UTMZone object or full proj string
  rowData: RowForUTMInput | null;
  commonUtmZones: { value: string; label: string; zone: number; hemisphere: 'N' | 'S' }[];
}


export default function UTMInputModal({ isOpen, onClose, onSave, rowData, commonUtmZones }: UTMInputModalProps) {
  const [selectedZoneValue, setSelectedZoneValue] = useState<string>(commonUtmZones.find(z => z.label.includes("Default"))?.value || commonUtmZones[0]?.value || ''); 
  const [customProjString, setCustomProjString] = useState<string>('');
  const [inputType, setInputType] = useState<'dropdown' | 'manual'>('dropdown');

  useEffect(() => {
    if (isOpen) {
      const providedZone = rowData?.row.__utmZoneProvided__;
      if (providedZone && commonUtmZones.some(z => z.value === providedZone)) {
        setSelectedZoneValue(providedZone);
        setInputType('dropdown');
        setCustomProjString('');
      } else if (providedZone && typeof providedZone === 'string' && (providedZone.startsWith('+proj=') || providedZone.toUpperCase().startsWith('EPSG:'))) { // It might be a custom string
        setCustomProjString(providedZone);
        setInputType('manual');
        setSelectedZoneValue(commonUtmZones.find(z => z.label.includes("Default"))?.value || commonUtmZones[0]?.value || '');
      } else { // No zone provided yet, set to default
        setSelectedZoneValue(commonUtmZones.find(z => z.label.includes("Default"))?.value || commonUtmZones[0]?.value || '');
        setCustomProjString('');
        setInputType('dropdown');
      }
    }
  }, [isOpen, rowData, commonUtmZones]);

  const handleSave = () => {
    if (inputType === 'dropdown') {
      const selected = commonUtmZones.find(z => z.value === selectedZoneValue);
      if (selected) {
        onSave({ zone: selected.zone, hemisphere: selected.hemisphere });
      } else {
         // Fallback or error, this shouldn't happen if selectedZoneValue is valid and commonUtmZones is populated
        const defaultZone = commonUtmZones.find(z => z.label.includes("Default")) || commonUtmZones[0];
        if (defaultZone) {
            onSave({zone: defaultZone.zone, hemisphere: defaultZone.hemisphere});
        } else {
            // Highly unlikely, but as a last resort:
            alert("Error: No UTM zones available for selection.");
            return;
        }
      }
    } else { // manual input
      if (customProjString.trim()) {
        onSave(customProjString.trim());
      } else {
        alert("Custom projection string cannot be empty.");
        return;
      }
    }
    onClose();
  };

  if (!rowData) return null;

  const eastingKey = Object.keys(rowData.row).find(h => h.toLowerCase() === 'easting/m' || h.toLowerCase() === 'easting');
  const northingKey = Object.keys(rowData.row).find(h => h.toLowerCase() === 'northing/m' || h.toLowerCase() === 'northing');


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Provide UTM Zone Information</DialogTitle>
          <DialogDescription>
            For row: <strong>{rowData.row.__rowIdentifier__}</strong> (File: {rowData.row.__fileName__}, Original Index: {rowData.row.__originalRowIndex__ + 1})
            <br />
            Easting: {eastingKey ? rowData.row[eastingKey] : 'N/A'}, Northing: {northingKey ? rowData.row[northingKey] : 'N/A'}
            <br />
            Latitude and Longitude are missing or invalid. Please provide the UTM zone for conversion.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="inputType" className="text-right col-span-1">
              Input Method
            </Label>
            <Select value={inputType} onValueChange={(v) => setInputType(v as 'dropdown' | 'manual')} >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select input type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dropdown">Select from list</SelectItem>
                <SelectItem value="manual">Enter custom Proj4 string</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {inputType === 'dropdown' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="utmZone" className="text-right col-span-1">
                UTM Zone
              </Label>
              <Select value={selectedZoneValue} onValueChange={setSelectedZoneValue}>
                <SelectTrigger id="utmZone" className="col-span-3">
                  <SelectValue placeholder="Select UTM Zone" />
                </SelectTrigger>
                <SelectContent>
                  {commonUtmZones.map((zone) => (
                    <SelectItem key={zone.value} value={zone.value}>
                      {zone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {inputType === 'manual' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="customProj" className="text-right col-span-1">
                Proj4 String
              </Label>
              <Input
                id="customProj"
                value={customProjString}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomProjString(e.target.value)}
                className="col-span-3"
                placeholder="+proj=utm +zone=XX +hem=N +datum=WGS84..."
              />
            </div>
          )}
           <p className="text-xs text-muted-foreground col-span-4 px-1">
            Ensure the Proj4 string correctly defines the source UTM projection for accurate conversion to WGS84 Lat/Lon. Example for UTM Zone 43N: <code>+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs +hemisphere=N</code>
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSave}>
            Save and Convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
