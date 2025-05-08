'use client';

import type { ChangeEvent } from 'react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { parseCsvToJson } from '@/lib/csv-parser';
import { applyIntelligentTransformations } from '@/lib/data-transformer';
import { mergeJsonArrays, restructureJsonArray, downloadJson, type JsonObject } from '@/lib/json-utils';
import { suggestTransformations, type SuggestTransformationsOutput } from '@/ai/flows/suggest-transformations';
import { generateColumnDescriptions, type GenerateColumnDescriptionsOutput } from '@/ai/flows/generate-column-descriptions';
import { UploadCloud, FileJson, Edit3, Download, Sparkles, Info, AlertTriangle, Loader2, Lightbulb, Settings2, ListChecks, ShieldAlert, Eye, FileWarning, GitCompareArrows, CheckCircle2, XCircle, AlertCircle, ArrowUpDown, FileCog, TableIcon } from 'lucide-react';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import UTMInputModal from './UTMInputModal';
import type { FileWithData as OriginalFileWithData, ProcessedJsonArray, ProcessedRow, TransformationLogEntry, UTMZone, RowForUTMInput, ApplyTransformationsResult } from '@/types/data';


interface KeyConfig {
  name: string;
  included: boolean;
  order: number;
}

type SortConfig<T> = {
  key: keyof T;
  direction: 'ascending' | 'descending';
} | null;

// Common UTM zones, can be moved to a shared constants file later
const commonUtmZones: { value: string; label: string; zone: number; hemisphere: 'N' | 'S' }[] = [
  { value: '42N', label: 'UTM Zone 42N', zone: 42, hemisphere: 'N' },
  { value: '43N', label: 'UTM Zone 43N (Default for Maldives)', zone: 43, hemisphere: 'N' },
  { value: '44N', label: 'UTM Zone 44N', zone: 44, hemisphere: 'N' },
  { value: '42S', label: 'UTM Zone 42S', zone: 42, hemisphere: 'S' },
  { value: '43S', label: 'UTM Zone 43S', zone: 43, hemisphere: 'S' },
  { value: '44S', label: 'UTM Zone 44S', zone: 44, hemisphere: 'S' },
  // Add more zones as needed
];


export default function DataForgeStudio() {
  const [uploadedFilesData, setUploadedFilesData] = useState<OriginalFileWithData[]>([]);
  const [processedJson, setProcessedJson] = useState<ProcessedJsonArray | null>(null);
  const [keyOrderConfig, setKeyOrderConfig] = useState<KeyConfig[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentError, setCurrentError] = useState<string | null>(null);
  
  const [aiSuggestions, setAiSuggestions] = useState<string[] | null>(null);
  const [columnDescriptions, setColumnDescriptions] = useState<GenerateColumnDescriptionsOutput | null>(null);
  const [showColumnDescriptions, setShowColumnDescriptions] = useState(false);
  
  const [applySmartTransforms, setApplySmartTransforms] = useState(true);
  const [activeMainTab, setActiveMainTab] = useState<string>('upload');

  const [transformationLog, setTransformationLog] = useState<TransformationLogEntry[]>([]);
  const [rowsDeselected, setRowsDeselected] = useState<Set<string>>(new Set()); // Set of ProcessedRow.__id__

  const [isUtmModalOpen, setIsUtmModalOpen] = useState(false);
  const [currentRowForUtmInput, setCurrentRowForUtmInput] = useState<RowForUTMInput | null>(null);
  const [utmZoneOverrides, setUtmZoneOverrides] = useState<Map<string, UTMZone | string>>(new Map());

  const { toast } = useToast();

  const [issueSortConfig, setIssueSortConfig] = useState<SortConfig<TransformationLogEntry>>({ key: 'originalRowIndex', direction: 'ascending'});
  const [validationSortConfig, setValidationSortConfig] = useState<SortConfig<TransformationLogEntry>>({ key: 'originalRowIndex', direction: 'ascending'});

  // State for bulk UTM application
  const [selectedFileIdForBulkUtm, setSelectedFileIdForBulkUtm] = useState<string | null>(null);
  const [bulkUtmZone, setBulkUtmZone] = useState<UTMZone | string | null>(null);
  const [bulkUtmInputType, setBulkUtmInputType] = useState<'dropdown' | 'manual'>('dropdown');
  const [bulkSelectedZoneValue, setBulkSelectedZoneValue] = useState<string>('43N'); // Default for dropdown
  const [bulkCustomProjString, setBulkCustomProjString] = useState<string>(''); // For manual input


  const resetStateForNewUpload = () => {
    setUploadedFilesData([]);
    setProcessedJson(null);
    setKeyOrderConfig([]);
    setCurrentError(null);
    setAiSuggestions(null);
    setColumnDescriptions(null);
    setShowColumnDescriptions(false);
    setTransformationLog([]);
    setRowsDeselected(new Set());
    setUtmZoneOverrides(new Map());
    setActiveMainTab('upload');
    setProgress(0);
    // Reset bulk UTM state
    setSelectedFileIdForBulkUtm(null);
    setBulkUtmZone(null);
    setBulkUtmInputType('dropdown');
    setBulkSelectedZoneValue('43N');
    setBulkCustomProjString('');
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    resetStateForNewUpload();
    setIsLoading(true);

    const newFilesToProcess: OriginalFileWithData[] = [];
    let totalProgress = 0;
    const filesArray = Array.from(files);
    const incrementPerFile = 100 / filesArray.length;

    for (const file of filesArray) {
      const fileId = `${file.name}-${Date.now()}`;
      try {
        const text = await file.text();
        let jsonData: JsonObject[] | null = null;

        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
          const parsed = await parseCsvToJson(text);
          if (parsed.errors.length > 0) {
            console.warn('CSV parsing errors:', parsed.errors);
            toast({ title: 'CSV Warning', description: `Some rows in ${file.name} might have issues.`, variant: 'default' });
          }
          jsonData = parsed.data;
        } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
          const parsedJson = JSON.parse(text);
          jsonData = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
        } else {
          throw new Error(`Unsupported file type: ${file.type || file.name.split('.').pop()}`);
        }
        
        if (jsonData) {
          newFilesToProcess.push({ file, data: jsonData, id: fileId, fileName: file.name });
        }
        
      } catch (err: any) {
        setCurrentError(`Error processing ${file.name}: ${err.message}`);
        toast({ title: 'File Error', description: `Failed to process ${file.name}.`, variant: 'destructive' });
      } finally {
        totalProgress += incrementPerFile;
        setProgress(Math.min(100, totalProgress));
      }
    }
    
    setUploadedFilesData(newFilesToProcess);

    if (newFilesToProcess.length > 0) {
      await processAndTransformFiles(newFilesToProcess, applySmartTransforms, utmZoneOverrides);
      const firstFileWithData = newFilesToProcess.find(f => f.data && (f.data as JsonObject[]).length > 0);
      if (firstFileWithData && (firstFileWithData.file.type === 'text/csv' || firstFileWithData.file.name.endsWith('.csv'))) {
          const headers = Object.keys((firstFileWithData.data as JsonObject[])[0]);
          try {
            const suggestionsOutput = await suggestTransformations({ columnHeaders: headers });
            setAiSuggestions(suggestionsOutput.transformations);
          } catch (aiError) {
            console.error("Error fetching AI suggestions:", aiError);
            // toast({ title: 'AI Suggestion Error', description: 'Could not fetch AI suggestions.', variant: 'default' });
          }
      }
      
      setActiveMainTab('issues'); // Move to issues tab after upload
    } else {
      toast({title: "No files processed", description: "No valid files were loaded.", variant: "default"});
    }
    setIsLoading(false);
  };
  

  const processAndTransformFiles = useCallback(async (
    filesToProcess: OriginalFileWithData[],
    applyTransforms: boolean,
    currentUtmOverrides: Map<string, UTMZone | string>
  ) => {
    if (filesToProcess.length === 0) {
      setProcessedJson(null);
      setTransformationLog([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setProgress(50); // Initial progress for starting transformation

    const mappedInput = filesToProcess.map(f => ({
      fileId: f.id,
      fileName: f.fileName,
      data: f.data as JsonObject[] 
    }));

    let transformationResult: ApplyTransformationsResult;
    if (applyTransforms) {
      transformationResult = applyIntelligentTransformations(mappedInput, currentUtmOverrides);
    } else {
      const basicProcessedData: ProcessedJsonArray = [];
      const basicLog: TransformationLogEntry[] = [];
      mappedInput.forEach(file => {
        file.data.forEach((originalRow, idx) => {
          const rowId = getRowIdentifier(originalRow, idx, file.fileName);
          const uniqueProcessedRowId = `${file.fileId}-${idx}`;
          const processedRow: ProcessedRow = {
            ...originalRow,
            __id__: uniqueProcessedRowId,
            __originalRowIndex__: idx,
            __fileId__: file.fileId,
            __fileName__: file.fileName,
            __rowIdentifier__: rowId,
          };
          basicProcessedData.push(processedRow);
          Object.keys(originalRow).forEach(key => {
            basicLog.push({
              fileId: file.fileId,
              originalRowIndex: idx,
              rowIdentifier: rowId,
              field: key,
              originalValue: originalRow[key],
              transformedValue: originalRow[key],
              status: 'Unchanged',
              details: 'Smart transformations disabled.',
              isError: false,
            });
          });
        });
      });
      transformationResult = { transformedData: basicProcessedData, transformationLog: basicLog };
    }
    
    setProcessedJson(transformationResult.transformedData);
    setTransformationLog(transformationResult.transformationLog);
    
    if (transformationResult.transformedData && transformationResult.transformedData.length > 0) {
      const sampleKeys = Object.keys(transformationResult.transformedData[0]).filter(k => !k.startsWith('__'));
      setKeyOrderConfig(sampleKeys.map((name, index) => ({ name, included: true, order: index })));
    } else {
      setKeyOrderConfig([]);
    }
    
    toast({ title: 'Files Processed', description: `${filesToProcess.length} file(s) loaded. Transformations applied: ${applyTransforms}.`, variant: 'default' });
    setProgress(100);
    setIsLoading(false);

    const needsInput = transformationResult.transformedData.some(row => row.__needsUTMInput__ && !currentUtmOverrides.has(row.__id__));
    if (needsInput) {
      setActiveMainTab('issues'); 
      toast({ title: "Action Required", description: "Some rows require UTM zone input. Check the 'Issues & UTM' tab.", variant: "default", duration: 5000});
    }

  }, [toast]);


  const handleUtmModalOpen = (row: ProcessedRow, indexInProcessedJson: number) => {
     setCurrentRowForUtmInput({row, rowIndexInProcessedJson: indexInProcessedJson});
     setIsUtmModalOpen(true);
  };

  const handleUtmSave = async (utmInput: UTMZone | string) => {
    if (!currentRowForUtmInput) return;
    
    const updatedOverrides = new Map(utmZoneOverrides);
    updatedOverrides.set(currentRowForUtmInput.row.__id__, utmInput);
    setUtmZoneOverrides(updatedOverrides);
    setIsUtmModalOpen(false);
    
    if (uploadedFilesData.length > 0) {
      toast({title: "Re-processing", description: "Applying new UTM information...", variant: "default"});
      await processAndTransformFiles(uploadedFilesData, applySmartTransforms, updatedOverrides);
    }
  };

  // Update bulkUtmZone based on UI selections for bulk apply
  useEffect(() => {
    if (bulkUtmInputType === 'dropdown') {
      const selected = commonUtmZones.find(z => z.value === bulkSelectedZoneValue);
      if (selected) {
        setBulkUtmZone({ zone: selected.zone, hemisphere: selected.hemisphere });
      } else {
        setBulkUtmZone(null); // Or a default if preferred
      }
    } else { // manual input
      if (bulkCustomProjString.trim()) {
        setBulkUtmZone(bulkCustomProjString.trim());
      } else {
        setBulkUtmZone(null); // Clear if custom string is empty
      }
    }
  }, [bulkUtmInputType, bulkSelectedZoneValue, bulkCustomProjString]);

  const handleBulkApplyUtmToFile = async () => {
    if (!selectedFileIdForBulkUtm) {
      toast({ title: "Select File", description: "Please select a file to apply the UTM zone.", variant: "destructive" });
      return;
    }
    if (!bulkUtmZone) {
       toast({ title: "Specify Zone", description: "Please specify a UTM zone or Proj4 string.", variant: "destructive" });
      return;
    }
  
    const newOverrides = new Map(utmZoneOverrides);
    let changesMade = 0;
  
    processedJson?.forEach(row => {
      if (row.__fileId__ === selectedFileIdForBulkUtm && row.__needsUTMInput__) {
        // Check if override already exists and is different, or just apply if needed
        // For simplicity, this will apply/overwrite for any row needing input in the selected file
        newOverrides.set(row.__id__, bulkUtmZone);
        changesMade++;
      }
    });
  
    if (changesMade === 0) {
      toast({ title: "No Rows Affected", description: `No rows in the selected file required UTM input update with this zone.`, variant: "default" });
      return;
    }
  
    setUtmZoneOverrides(newOverrides);
    
    const fileName = uploadedFilesData.find(f => f.id === selectedFileIdForBulkUtm)?.fileName || 'the selected file';
    toast({ 
      title: "Bulk UTM Applied", 
      description: `UTM zone applied to ${changesMade} row(s) in ${fileName}. Re-processing...`, 
      variant: "default" 
    });
  
    await processAndTransformFiles(uploadedFilesData, applySmartTransforms, newOverrides);
  };


  const handleKeyOrderChange = (keyName: string, direction: 'up' | 'down') => {
    setKeyOrderConfig(prev => {
      const newOrder = [...prev.sort((a, b) => a.order - b.order)];
      const index = newOrder.findIndex(k => k.name === keyName);
      if (index === -1) return prev;

      const item = newOrder[index];
      if (direction === 'up' && index > 0) {
        newOrder.splice(index, 1);
        newOrder.splice(index - 1, 0, item);
      } else if (direction === 'down' && index < newOrder.length - 1) {
        newOrder.splice(index, 1);
        newOrder.splice(index + 1, 0, item);
      }
      return newOrder.map((k, idx) => ({ ...k, order: idx }));
    });
  };

  const handleKeyInclusionChange = (keyName: string) => {
    setKeyOrderConfig(prev => prev.map(k => k.name === keyName ? { ...k, included: !k.included } : k));
  };

  const handleRowDeselection = (rowId: string) => {
    setRowsDeselected(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  };
  
  const getFinalJson = useCallback(() => {
    if (!processedJson) return null;
    
    const filteredData = processedJson.filter(row => !rowsDeselected.has(row.__id__));

    const orderedKeys = keyOrderConfig
      .filter(k => k.included)
      .sort((a,b) => a.order - b.order)
      .map(k => k.name);
      
    const includedKeysMap = keyOrderConfig.reduce((acc, k) => {
      acc[k.name] = k.included;
      return acc;
    }, {} as Record<string, boolean>);

    return restructureJsonArray(filteredData, orderedKeys, includedKeysMap, true); 
  }, [processedJson, keyOrderConfig, rowsDeselected]);


  const handleDownload = () => {
    const finalJson = getFinalJson();
    if (finalJson && finalJson.length > 0) {
      downloadJson(finalJson, 'dataforge_output.json');
      toast({ title: 'Download Started', description: 'Your JSON file is being downloaded.', variant: 'default', className: 'bg-accent text-accent-foreground' });
    } else {
      toast({ title: 'No Data', description: 'No data to download (possibly all rows with issues were deselected or no files processed).', variant: 'destructive' });
    }
  };

  const fetchColumnDescriptions = async () => {
    if (!processedJson || processedJson.length === 0) {
      toast({ title: 'No Data', description: 'Upload data to generate descriptions.', variant: 'destructive' });
      return;
    }
    
    const headers = keyOrderConfig.filter(k => k.included).map(k => k.name);
    if (headers.length === 0) {
         toast({ title: 'No Columns', description: 'No columns selected for description generation.', variant: 'destructive' });
         return;
    }
    const sampleCsvData = [
      headers.join(','),
      ...processedJson.slice(0, 5).map(row => headers.map(header => JSON.stringify(row[header])).join(','))
    ].join('\n');

    setIsLoading(true);
    try {
      const descriptions = await generateColumnDescriptions({ csvData: sampleCsvData });
      setColumnDescriptions(descriptions);
      setShowColumnDescriptions(true);
      toast({ title: 'Descriptions Generated', description: 'AI-powered column descriptions are ready.', variant: 'default' });
    } catch (err) {
      console.error("Error generating column descriptions:", err);
      toast({ title: 'AI Error', description: 'Could not generate column descriptions.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };
  
  const finalJsonOutputForPreview = getFinalJson();
  const previewData = finalJsonOutputForPreview ? JSON.stringify(finalJsonOutputForPreview.slice(0, 10), null, 2) : "No data to display or all rows deselected.";

  const errorLogEntries = useMemo(() => transformationLog.filter(log => log.isError || log.requiresUtmInput), [transformationLog]);
  
  const rowsNeedingUtmInput = useMemo(() => {
    if (!processedJson) return [];
    return processedJson.reduce((acc, row, index) => {
      if (row.__needsUTMInput__ && !utmZoneOverrides.has(row.__id__)) {
        acc.push({ row, rowIndexInProcessedJson: index });
      }
      return acc;
    }, [] as RowForUTMInput[]);
  }, [processedJson, utmZoneOverrides]);

  const filesWithPendingUtmInput = useMemo(() => {
    if (!processedJson) return [];
    const fileIdsRequiringInput = new Set<string>();
    processedJson.forEach(row => {
      if (row.__needsUTMInput__ && !utmZoneOverrides.has(row.__id__)) {
        fileIdsRequiringInput.add(row.__fileId__);
      }
    });
    return uploadedFilesData.filter(file => fileIdsRequiringInput.has(file.id));
  }, [processedJson, utmZoneOverrides, uploadedFilesData]);


  const requestSort = <T, >(key: keyof T, currentSortConfig: SortConfig<T>, setSortConfig: React.Dispatch<React.SetStateAction<SortConfig<T>>>) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (currentSortConfig && currentSortConfig.key === key && currentSortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const sortedErrorLog = useMemo(() => {
    if (!issueSortConfig) return errorLogEntries;
    return [...errorLogEntries].sort((a, b) => {
      const valA = a[issueSortConfig.key!];
      const valB = b[issueSortConfig.key!];
      if (valA === undefined || valA === null) return 1; // Put undefined/null values at the end
      if (valB === undefined || valB === null) return -1;
      if (valA < valB) {
        return issueSortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (valA > valB) {
        return issueSortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  }, [errorLogEntries, issueSortConfig]);

  const sortedValidationLog = useMemo(() => {
    if (!validationSortConfig) return transformationLog;
    return [...transformationLog].sort((a, b) => {
      const valA = a[validationSortConfig.key!];
      const valB = b[validationSortConfig.key!];
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;
      if (valA < valB) {
        return validationSortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (valA > valB) {
        return validationSortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  }, [transformationLog, validationSortConfig]);

  const getSortIndicator = <T, >(key: keyof T, currentSortConfig: SortConfig<T>) => {
    if (!currentSortConfig || currentSortConfig.key !== key) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    }
    return currentSortConfig.direction === 'ascending' ? '↑' : '↓';
  };
  
  const outputTableHeaders = useMemo(() => {
    if (!finalJsonOutputForPreview || finalJsonOutputForPreview.length === 0) return [];
    return Object.keys(finalJsonOutputForPreview[0]);
  }, [finalJsonOutputForPreview]);


  return (
    <div className="space-y-6 pb-16">
      <header className="text-center py-6">
        <h1 className="text-4xl font-bold text-primary flex items-center justify-center">
          <Sparkles className="w-10 h-10 mr-3 text-accent" /> DataForge Studio
        </h1>
        <p className="text-muted-foreground text-md mt-2 max-w-2xl mx-auto">
          Your comprehensive toolkit for CSV/JSON conversion, merging, structural editing, and intelligent data transformation.
        </p>
      </header>

      {currentError && (
        <Alert variant="destructive" className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{currentError}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 gap-1 h-auto p-1">
          <TabsTrigger value="upload" className="py-2 text-xs sm:text-sm"><UploadCloud className="mr-1 sm:mr-2 h-4 w-4" />Upload</TabsTrigger>
          <TabsTrigger value="issues" className="py-2 text-xs sm:text-sm" disabled={!processedJson}>
            <FileWarning className="mr-1 sm:mr-2 h-4 w-4" />Issues & UTM {!isLoading && rowsNeedingUtmInput.length > 0 && <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-destructive text-destructive-foreground rounded-full">{rowsNeedingUtmInput.length}</span>}
            </TabsTrigger>
          <TabsTrigger value="validation" className="py-2 text-xs sm:text-sm" disabled={!processedJson}><ListChecks className="mr-1 sm:mr-2 h-4 w-4" />Validation</TabsTrigger>
          <TabsTrigger value="structure" className="py-2 text-xs sm:text-sm" disabled={!processedJson}><Settings2 className="mr-1 sm:mr-2 h-4 w-4" />Structure</TabsTrigger>
          <TabsTrigger value="output" className="py-2 text-xs sm:text-sm" disabled={!processedJson}><FileJson className="mr-1 sm:mr-2 h-4 w-4" />Output</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center text-xl"><UploadCloud className="mr-2 h-5 w-5" />Upload Files</CardTitle>
              <CardDescription>Select CSV or JSON files. CSVs will be parsed and can be intelligently transformed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/20">
                <Switch
                  id="smart-transforms-switch"
                  checked={applySmartTransforms}
                  onCheckedChange={setApplySmartTransforms}
                  disabled={isLoading}
                />
                <Label htmlFor="smart-transforms-switch" className="text-sm font-medium">
                  Apply Intelligent Transformations
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Automatically handles DMS to DD, UTM to Lat/Lon (prompts for zone if needed), and URL normalization for relevant CSV columns (Lat, Long, Easting/m, Northing/m, Island, URL).</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                accept=".csv,.json"
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
              />
              {isLoading && (
                <div className="space-y-2 pt-2">
                  <Progress value={progress} className="w-full h-2" />
                  <p className="text-sm text-muted-foreground text-center">Processing files... {Math.round(progress)}%</p>
                </div>
              )}
              {uploadedFilesData.length > 0 && !isLoading && (
                <div className="mt-4 p-3 border rounded-md bg-muted/20">
                  <h3 className="font-semibold mb-2 text-sm">Uploaded Files:</h3>
                  <ul className="space-y-1 text-xs list-disc list-inside">
                    {uploadedFilesData.map((f) => (
                      <li key={f.id} className="text-muted-foreground">{f.fileName} ({Array.isArray(f.data) ? f.data.length : f.data ? 1 : 0} items)</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="mt-6">
           <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center text-xl"><FileWarning className="mr-2 h-5 w-5 text-amber-500" />Transformation Issues & UTM Input</CardTitle>
              <CardDescription>Review transformation errors, rows requiring UTM zone input, and manage problematic data. You can also apply a UTM zone to all applicable rows in a single file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {rowsNeedingUtmInput.length > 0 && (
                <Alert variant="default" className="border-amber-500">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <AlertTitle className="font-semibold text-amber-600">UTM Zone Input Required</AlertTitle>
                  <AlertDescription>
                    {rowsNeedingUtmInput.length} row(s) need UTM zone information. Use the 'Provide UTM' button for individual rows below, or use the 'Bulk Apply UTM Zone' section.
                  </AlertDescription>
                </Alert>
              )}

              {filesWithPendingUtmInput.length > 0 && (
                <div className="p-4 border rounded-md space-y-4 bg-muted/10">
                  <h3 className="font-semibold text-md flex items-center"><FileCog className="mr-2 h-5 w-5 text-primary" />Bulk Apply UTM Zone to a File</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <Label htmlFor="bulk-utm-file-select" className="text-xs">Select File</Label>
                        <Select
                        value={selectedFileIdForBulkUtm || ""}
                        onValueChange={setSelectedFileIdForBulkUtm}
                        disabled={isLoading}
                        >
                        <SelectTrigger id="bulk-utm-file-select">
                            <SelectValue placeholder="Select a file..." />
                        </SelectTrigger>
                        <SelectContent>
                            {filesWithPendingUtmInput.map(file => (
                            <SelectItem key={file.id} value={file.id}>{file.fileName}</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="bulk-utm-type" className="text-xs">UTM Input Method</Label>
                        <Select value={bulkUtmInputType} onValueChange={(v) => setBulkUtmInputType(v as 'dropdown' | 'manual')}>
                        <SelectTrigger id="bulk-utm-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="dropdown">Select from list</SelectItem>
                            <SelectItem value="manual">Enter custom Proj4 string</SelectItem>
                        </SelectContent>
                        </Select>
                    </div>
                   </div>

                  {bulkUtmInputType === 'dropdown' && (
                    <div>
                      <Label htmlFor="bulk-utm-zone-dropdown" className="text-xs">UTM Zone</Label>
                      <Select value={bulkSelectedZoneValue} onValueChange={setBulkSelectedZoneValue}>
                        <SelectTrigger id="bulk-utm-zone-dropdown"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {commonUtmZones.map((zone) => (
                            <SelectItem key={zone.value} value={zone.value}>{zone.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {bulkUtmInputType === 'manual' && (
                    <div>
                      <Label htmlFor="bulk-utm-custom-proj" className="text-xs">Custom Proj4 String</Label>
                      <Input
                        id="bulk-utm-custom-proj"
                        value={bulkCustomProjString}
                        onChange={(e) => setBulkCustomProjString(e.target.value)}
                        placeholder="+proj=utm +zone=XX +hem=N +datum=WGS84..."
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Example for UTM Zone 43N: <code>+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs +hemisphere=N</code>
                  </p>
                  <Button onClick={handleBulkApplyUtmToFile} disabled={isLoading || !selectedFileIdForBulkUtm || !bulkUtmZone} size="sm">
                    <Sparkles className="mr-2 h-4 w-4" /> Apply to Selected File
                  </Button>
                </div>
              )}


              <div>
                <h3 className="font-semibold text-md mb-2 flex items-center"><ShieldAlert className="mr-2 h-5 w-5 text-destructive" />Issue Log & Actions</h3>
                {sortedErrorLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 border rounded-md text-center">No transformation issues or rows requiring UTM input found. Good job!</p>
                ) : (
                <ScrollArea className="h-[400px] w-full border rounded-md">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-[80px] px-2 py-1">
                           <Button variant="ghost" size="sm" onClick={() => requestSort<TransformationLogEntry>('rowIdentifier' as any, issueSortConfig, setIssueSortConfig)} className="px-1 text-xs text-left w-full justify-start">
                            Include {getSortIndicator<TransformationLogEntry>('rowIdentifier' as any, issueSortConfig)}
                          </Button>
                        </TableHead>
                        <TableHead className="w-[150px] px-2 py-1">
                          <Button variant="ghost" size="sm" onClick={() => requestSort<TransformationLogEntry>('rowIdentifier', issueSortConfig, setIssueSortConfig)} className="px-1 text-xs text-left w-full justify-start">
                           ID/Row {getSortIndicator<TransformationLogEntry>('rowIdentifier', issueSortConfig)}
                          </Button>
                        </TableHead>
                        <TableHead className="px-2 py-1">
                           <Button variant="ghost" size="sm" onClick={() => requestSort<TransformationLogEntry>('field', issueSortConfig, setIssueSortConfig)} className="px-1 text-xs text-left w-full justify-start">
                            Fields {getSortIndicator<TransformationLogEntry>('field', issueSortConfig)}
                          </Button>
                        </TableHead>
                        <TableHead className="px-2 py-1">
                           <Button variant="ghost" size="sm" onClick={() => requestSort<TransformationLogEntry>('details', issueSortConfig, setIssueSortConfig)} className="px-1 text-xs text-left w-full justify-start">
                            Details {getSortIndicator<TransformationLogEntry>('details', issueSortConfig)}
                           </Button>
                        </TableHead>
                        <TableHead className="w-[150px] text-center px-2 py-1">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedErrorLog.map((log, index) => {
                        const rowId = `${log.fileId}-${log.originalRowIndex}`;
                        const correspondingProcessedRow = processedJson?.find(pr => pr.__id__ === rowId);
                        const rowIndexInProcessedJson = processedJson?.findIndex(pr => pr.__id__ === rowId) ?? -1;
                        return (
                          <TableRow key={`${rowId}-${log.field}-${index}`} className={rowsDeselected.has(rowId) ? 'opacity-50 bg-muted/30' : ''}>
                            <TableCell className="text-center px-2 py-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Checkbox
                                      checked={!rowsDeselected.has(rowId)}
                                      onCheckedChange={() => handleRowDeselection(rowId)}
                                      aria-label={`Toggle inclusion of row ${log.rowIdentifier}`}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{rowsDeselected.has(rowId) ? 'Include this row in output' : 'Exclude this row from output'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell className="text-xs font-medium px-2 py-1" title={log.fileId}>
                                {log.rowIdentifier}
                                <div className="text-muted-foreground text-[10px]">File: {uploadedFilesData.find(f=>f.id === log.fileId)?.fileName}</div>
                            </TableCell>
                            <TableCell className="text-xs px-2 py-1">{log.field}</TableCell>
                            <TableCell className="text-xs px-2 py-1">
                              <span className={`font-semibold ${log.status === 'Error' ? 'text-destructive' : log.requiresUtmInput ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                {log.status}:
                              </span> {log.details} 
                              {log.originalValue !== undefined && log.originalValue !== null && String(log.originalValue).length < 50 && <span className="text-muted-foreground text-[10px]"> (Original: {String(log.originalValue)})</span>}
                            </TableCell>
                            <TableCell className="text-center px-2 py-1">
                              {log.requiresUtmInput && correspondingProcessedRow && rowIndexInProcessedJson !== -1 && !utmZoneOverrides.has(rowId) && (
                                <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => handleUtmModalOpen(correspondingProcessedRow, rowIndexInProcessedJson)}>
                                  Provide UTM
                                </Button>
                              )}
                              {utmZoneOverrides.has(rowId) && <span className="text-xs text-green-600 flex items-center justify-center"><CheckCircle2 className="w-3 h-3 mr-1"/>UTM Provided</span>}
                              {log.isError && !log.requiresUtmInput && <span className="text-xs text-destructive flex items-center justify-center"><XCircle className="w-3 h-3 mr-1"/>Error</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                 </ScrollArea>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="mt-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center text-xl"><GitCompareArrows className="mr-2 h-5 w-5 text-blue-500" />Full Transformation Log</CardTitle>
              <CardDescription>Compare original values with transformed values for all fields. Review statuses and details of each transformation step.</CardDescription>
            </CardHeader>
            <CardContent>
              {transformationLog.length === 0 ? (
                 <p className="text-sm text-muted-foreground p-4 border rounded-md text-center">No transformation log to display. Process some files first.</p>
              ) : (
              <ScrollArea className="h-[600px] w-full border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                       <TableHead className="w-[150px] px-2 py-1">
                         <Button variant="ghost" size="sm" onClick={() => requestSort<TransformationLogEntry>('rowIdentifier', validationSortConfig, setValidationSortConfig)} className="px-1 text-xs text-left w-full justify-start">
                           ID/Row {getSortIndicator<TransformationLogEntry>('rowIdentifier', validationSortConfig)}
                          </Button>
                        </TableHead>
                      <TableHead className="px-2 py-1">
                        <Button variant="ghost" size="sm" onClick={() => requestSort<TransformationLogEntry>('field', validationSortConfig, setValidationSortConfig)} className="px-1 text-xs text-left w-full justify-start">
                           Field {getSortIndicator<TransformationLogEntry>('field', validationSortConfig)}
                          </Button>
                      </TableHead>
                      <TableHead className="px-2 py-1">Original Value</TableHead>
                      <TableHead className="px-2 py-1">Transformed Value</TableHead>
                      <TableHead className="w-[100px] px-2 py-1">
                         <Button variant="ghost" size="sm" onClick={() => requestSort<TransformationLogEntry>('status', validationSortConfig, setValidationSortConfig)} className="px-1 text-xs text-left w-full justify-start">
                           Status {getSortIndicator<TransformationLogEntry>('status', validationSortConfig)}
                          </Button>
                      </TableHead>
                      <TableHead className="px-2 py-1">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedValidationLog.map((log, index) => (
                      <TableRow key={`${log.fileId}-${log.originalRowIndex}-${log.field}-${index}`} className={rowsDeselected.has(`${log.fileId}-${log.originalRowIndex}`) ? 'opacity-40' : ''}>
                        <TableCell className="text-xs font-medium px-2 py-1" title={log.fileId}>
                            {log.rowIdentifier}
                            <div className="text-muted-foreground text-[10px]">File: {uploadedFilesData.find(f=>f.id === log.fileId)?.fileName}</div>
                        </TableCell>
                        <TableCell className="text-xs px-2 py-1">{log.field}</TableCell>
                        <TableCell className="text-xs font-mono max-w-[150px] truncate px-2 py-1" title={String(log.originalValue)}>{String(log.originalValue)}</TableCell>
                        <TableCell className="text-xs font-mono max-w-[150px] truncate px-2 py-1" title={String(log.transformedValue)}>{String(log.transformedValue)}</TableCell>
                        <TableCell className="text-xs px-2 py-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                            log.status === 'Transformed' ? 'bg-blue-100 text-blue-700' :
                            log.status === 'Filled' ? 'bg-green-100 text-green-700' :
                            log.status === 'Error' ? 'bg-red-100 text-red-700' :
                            log.status === 'NeedsManualUTMInput' || log.status === 'PendingUTMInput' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {log.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate px-2 py-1" title={log.details}>{log.details}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="structure" className="mt-6">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center text-xl"><Settings2 className="mr-2 h-5 w-5" />Edit JSON Structure</CardTitle>
                    <CardDescription>Reorder fields or uncheck to exclude them from the final output. These settings apply to all files.</CardDescription>
                </CardHeader>
                <CardContent>
                    {keyOrderConfig.length > 0 ? (
                        <ScrollArea className="h-[400px] w-full border rounded-md p-2 bg-muted/20">
                        <div className="space-y-2 p-2">
                        {keyOrderConfig.sort((a,b) => a.order - b.order).map((keyItem) => (
                            <div key={keyItem.name} className="flex items-center justify-between p-3 border rounded-md bg-background shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center space-x-3">
                                    <Checkbox
                                        id={`key-${keyItem.name}`}
                                        checked={keyItem.included}
                                        onCheckedChange={() => handleKeyInclusionChange(keyItem.name)}
                                        aria-label={`Include field ${keyItem.name}`}
                                    />
                                    <Label htmlFor={`key-${keyItem.name}`} className="font-medium text-sm">{keyItem.name}</Label>
                                </div>
                                <div className="space-x-1">
                                    <TooltipProvider>
                                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleKeyOrderChange(keyItem.name, 'up')} disabled={keyItem.order === 0}>↑</Button></TooltipTrigger><TooltipContent><p>Move Up</p></TooltipContent></Tooltip>
                                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleKeyOrderChange(keyItem.name, 'down')} disabled={keyItem.order === keyOrderConfig.length - 1}>↓</Button></TooltipTrigger><TooltipContent><p>Move Down</p></TooltipContent></Tooltip>
                                    </TooltipProvider>
                                </div>
                            </div>
                        ))}
                        </div>
                        </ScrollArea>
                    ) : (
                        <p className="text-sm text-muted-foreground p-4 border rounded-md text-center">No fields to display. Process some files first and ensure they have data.</p>
                    )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="output" className="mt-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center text-xl"><FileJson className="mr-2 h-5 w-5" />Final Output Preview</CardTitle>
              <CardDescription>Preview your final JSON data (first 10 records in raw format, full data in table view) after merging, transformations, and structure edits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <Tabs defaultValue="raw-json" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="raw-json"><FileJson className="mr-2 h-4 w-4" />Raw JSON (10 Records)</TabsTrigger>
                  <TabsTrigger value="table-view"><TableIcon className="mr-2 h-4 w-4" />Table View (All Records)</TabsTrigger>
                </TabsList>
                <TabsContent value="raw-json" className="mt-4">
                  <ScrollArea className="h-[400px] w-full border rounded-md bg-muted/20">
                    <Textarea
                        value={previewData}
                        readOnly
                        rows={20}
                        className="w-full font-mono text-xs bg-background p-2" 
                        placeholder="JSON output will appear here..."
                    />
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="table-view" className="mt-4">
                  {finalJsonOutputForPreview && finalJsonOutputForPreview.length > 0 ? (
                    <ScrollArea className="h-[600px] w-full border rounded-md">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            {outputTableHeaders.map(header => (
                              <TableHead key={header} className="px-2 py-1 text-xs whitespace-nowrap">{header}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {finalJsonOutputForPreview.map((row, rowIndex) => (
                            <TableRow key={`output-row-${rowIndex}`}>
                              {outputTableHeaders.map(header => (
                                <TableCell key={`output-cell-${rowIndex}-${header}`} className="text-xs px-2 py-1 max-w-[200px] truncate" title={String(row[header])}>
                                  {String(row[header])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground p-4 border rounded-md text-center">No data to display in table view. Process files or check filters.</p>
                  )}
                </TabsContent>
              </Tabs>


              <div>
                <h3 className="font-semibold text-md mb-2 flex items-center"><Lightbulb className="mr-2 h-5 w-5 text-yellow-400" />AI Insights</h3>
                 <div className="p-4 border rounded-md space-y-4 bg-muted/20">
                    {aiSuggestions && aiSuggestions.length > 0 ? (
                        <div>
                            <h4 className="font-medium text-sm mb-1">Transformation Suggestions:</h4>
                            <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                                {aiSuggestions.map((suggestion, i) => <li key={i}>{suggestion}</li>)}
                            </ul>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">No AI transformation suggestions available for the current data.</p>
                    )}
                    <Separator />
                    <div className="flex justify-between items-center">
                        <h4 className="font-medium text-sm">Column Descriptions:</h4>
                        <Button onClick={fetchColumnDescriptions} variant="outline" size="sm" disabled={isLoading || !processedJson || keyOrderConfig.filter(k=>k.included).length === 0} className="text-xs">
                        {isLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                        Generate
                        </Button>
                    </div>
                    {showColumnDescriptions && columnDescriptions ? (
                        <ScrollArea className="h-[200px] border rounded-md p-2 bg-background">
                        <Table>
                            <TableHeader><TableRow><TableHead className="w-[150px] text-xs px-2 py-1">Column</TableHead><TableHead className="text-xs px-2 py-1">AI Description</TableHead></TableRow></TableHeader>
                            <TableBody>
                            {Object.entries(columnDescriptions).map(([col, desc]) => (
                                <TableRow key={col}><TableCell className="font-medium text-xs px-2 py-1">{col}</TableCell><TableCell className="text-xs px-2 py-1">{desc}</TableCell></TableRow>
                            ))}
                            </TableBody>
                        </Table>
                        </ScrollArea>
                    ) : (
                        <p className="text-xs text-muted-foreground">Click "Generate" for AI-powered column descriptions based on your selected fields.</p>
                    )}
                 </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button 
                    onClick={handleDownload} 
                    disabled={!finalJsonOutputForPreview || finalJsonOutputForPreview.length === 0 || isLoading} 
                    className="bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  <Download className="mr-2 h-5 w-5" /> Download Processed JSON
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isUtmModalOpen && currentRowForUtmInput && (
        <UTMInputModal
          isOpen={isUtmModalOpen}
          onClose={() => setIsUtmModalOpen(false)}
          onSave={handleUtmSave}
          rowData={currentRowForUtmInput}
          commonUtmZones={commonUtmZones}
        />
      )}

      <footer className="text-center py-6 mt-8 border-t">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} DataForge Studio. Powered by Next.js & Genkit.
        </p>
      </footer>
    </div>
  );
}
// Helper to get a display identifier for a row
function getRowIdentifier(row: JsonObject, rowIndex: number, fileName: string): string {
  const psmKeys = ["PSM Station Number", "PSM_Station_Number", "PSMNo", "PSM_No", "ID", "psm_id"];
  for (const key of psmKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]);
    }
  }
  return `${fileName} Original Row ${rowIndex + 1}`;
}

