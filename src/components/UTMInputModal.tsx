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
import type { RowForUTMInput, UTMZone, UTMModalInputData } from '@/types/data';

interface UTMInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: UTMModalInputData) => void;
  rowData: RowForUTMInput | null;
  commonUtmZones: { value: string; label: string; zone: number; hemisphere: 'N' | 'S' }[];
}


export default function UTMInputModal({ isOpen, onClose, onSave, rowData, commonUtmZones }: UTMInputModalProps) {
  const [selectedZoneValue, setSelectedZoneValue] = useState<string>(commonUtmZones.find(z => z.label.includes("Default"))?.value || commonUtmZones[0]?.value || ''); 
  const [customProjString, setCustomProjString] = useState<string>('');
  const [inputType, setInputType] = useState<'dropdown' | 'manual'>('dropdown');
  const [easting, setEasting] = useState<string>('');
  const [northing, setNorthing] = useState<string>('');

  const requiresENInput = rowData?.requiresENInput || false;

  useEffect(() => {
    if (isOpen && rowData) {
      const providedZone = rowData.row.__utmZoneProvided__;
      // Reset fields based on rowData
      setEasting(requiresENInput ? String(rowData.row[Object.keys(rowData.row).find(k => k.toLowerCase() === 'easting/m' || k.toLowerCase() === 'easting') || ''] || '') : '');
      setNorthing(requiresENInput ? String(rowData.row[Object.keys(rowData.row).find(k => k.toLowerCase() === 'northing/m' || k.toLowerCase() === 'northing') || ''] || '') : '');


      if (providedZone && commonUtmZones.some(z => z.value === providedZone)) {
        setSelectedZoneValue(providedZone);
        setInputType('dropdown');
        setCustomProjString('');
      } else if (providedZone && typeof providedZone === 'string' && (providedZone.startsWith('+proj=') || providedZone.toUpperCase().startsWith('EPSG:'))) {
        setCustomProjString(providedZone);
        setInputType('manual');
        setSelectedZoneValue(commonUtmZones.find(z => z.label.includes("Default"))?.value || commonUtmZones[0]?.value || '');
      } else { 
        setSelectedZoneValue(commonUtmZones.find(z => z.label.includes("Default"))?.value || commonUtmZones[0]?.value || '');
        setCustomProjString('');
        setInputType('dropdown');
      }
    } else if (!isOpen) {
      // Reset when closed
      setEasting('');
      setNorthing('');
    }
  }, [isOpen, rowData, commonUtmZones, requiresENInput]);

  const handleSave = () => {
    let utmInputResult: UTMZone | string;

    if (inputType === 'dropdown') {
      const selected = commonUtmZones.find(z => z.value === selectedZoneValue);
      if (selected) {
        utmInputResult = { zone: selected.zone, hemisphere: selected.hemisphere };
      } else {
        const defaultZone = commonUtmZones.find(z => z.label.includes("Default")) || commonUtmZones[0];
        if (defaultZone) {
            utmInputResult = {zone: defaultZone.zone, hemisphere: defaultZone.hemisphere};
        } else {
            alert("Error: No UTM zones available for selection.");
            return;
        }
      }
    } else { // manual input
      if (customProjString.trim()) {
        utmInputResult = customProjString.trim();
      } else {
        alert("Custom projection string cannot be empty.");
        return;
      }
    }

    if (requiresENInput) {
        if (!easting.trim() || !northing.trim() || isNaN(parseFloat(easting)) || isNaN(parseFloat(northing))) {
            alert("Easting and Northing must be provided as valid numbers.");
            return;
        }
         onSave({ utmInput: utmInputResult, easting: easting.trim(), northing: northing.trim() });
    } else {
        onSave({ utmInput: utmInputResult });
    }
    onClose();
  };

  if (!rowData) return null;

  const currentEastingKey = Object.keys(rowData.row).find(h => h.toLowerCase() === 'easting/m' || h.toLowerCase() === 'easting');
  const currentNorthingKey = Object.keys(rowData.row).find(h => h.toLowerCase() === 'northing/m' || h.toLowerCase() === 'northing');
  const islandKey = Object.keys(rowData.row).find(h => h.toLowerCase() === 'island');
  const urlKey = Object.keys(rowData.row).find(h => h.toLowerCase() === 'url');

  const islandValue = islandKey ? rowData.row[islandKey] : 'N/A';
  const urlValue = urlKey ? rowData.row[urlKey] : 'N/A';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Provide UTM Information</DialogTitle>
          <DialogDescription>
            For row: <strong>{rowData.row.__rowIdentifier__}</strong> (File: {rowData.row.__fileName__}, Original Index: {rowData.row.__originalRowIndex__ + 1})
            <br />
            Island: {islandValue}, URL: {String(urlValue).length > 50 ? String(urlValue).substring(0, 50) + '...' : urlValue}
            <br />
            {!requiresENInput && (
                <>Easting: {currentEastingKey ? rowData.row[currentEastingKey] : 'N/A'}, Northing: {currentNorthingKey ? rowData.row[currentNorthingKey] : 'N/A'}<br/></>
            )}
            {requiresENInput ? "Easting, Northing, and UTM Zone are required." : "Latitude and Longitude are missing or invalid. Please provide the UTM zone for conversion."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
         {requiresENInput && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="easting" className="text-right col-span-1">
                  Easting
                </Label>
                <Input
                  id="easting"
                  value={easting}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEasting(e.target.value)}
                  className="col-span-3"
                  placeholder="Enter Easting value"
                  type="number"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="northing" className="text-right col-span-1">
                  Northing
                </Label>
                <Input
                  id="northing"
                  value={northing}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNorthing(e.target.value)}
                  className="col-span-3"
                  placeholder="Enter Northing value"
                  type="number"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="inputType" className="text-right col-span-1">
              UTM Zone Method
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
