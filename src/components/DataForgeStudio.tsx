'use client';

import type { ChangeEvent } from 'react';
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { parseCsvToJson } from '@/lib/csv-parser';
import { applyIntelligentTransformations, getRelevantTransformationColumns, type DataRow } from '@/lib/data-transformer';
import { mergeJsonArrays, restructureJsonArray, downloadJson, type JsonArray, type JsonObject } from '@/lib/json-utils';
import { suggestTransformations, type SuggestTransformationsOutput } from '@/ai/flows/suggest-transformations';
import { generateColumnDescriptions, type GenerateColumnDescriptionsOutput } from '@/ai/flows/generate-column-descriptions';
import { UploadCloud, FileJson, Combine, Edit3, Download, Sparkles, Info, AlertTriangle, Loader2, Lightbulb } from 'lucide-react';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Switch } from './ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FileWithData {
  file: File;
  data: JsonArray | JsonObject | null;
  id: string;
}

interface KeyConfig {
  name: string;
  included: boolean;
}

export default function DataForgeStudio() {
  const [uploadedFiles, setUploadedFiles] = useState<FileWithData[]>([]);
  const [processedJson, setProcessedJson] = useState<JsonArray | null>(null);
  const [keyOrder, setKeyOrder] = useState<KeyConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[] | null>(null);
  const [columnDescriptions, setColumnDescriptions] = useState<GenerateColumnDescriptionsOutput | null>(null);
  const [showColumnDescriptions, setShowColumnDescriptions] = useState(false);
  const [applySmartTransforms, setApplySmartTransforms] = useState(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'structure' | 'ai'>('preview');


  const { toast } = useToast();

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setIsLoading(true);
    setError(null);
    setProgress(0);
    setAiSuggestions(null);
    setColumnDescriptions(null);
    setProcessedJson(null);
    setKeyOrder([]);

    const newFiles: FileWithData[] = [];
    let totalProgress = 0;
    const increment = 100 / files.length / 2; // Each file has parsing and potential AI steps

    for (const file of Array.from(files)) {
      const fileId = `${file.name}-${Date.now()}`;
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const text = e.target?.result as string;
          let jsonData: JsonArray | null = null;

          if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            const parsed = await parseCsvToJson(text);
            if (parsed.errors.length > 0) {
              console.warn('CSV parsing errors:', parsed.errors);
              toast({ title: 'CSV Warning', description: `Some rows in ${file.name} might have issues.`, variant: 'default' });
            }
            jsonData = parsed.data;
            
            if (applySmartTransforms) {
                const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
                const relevantCols = getRelevantTransformationColumns();
                const hasRelevantCols = headers.some(h => relevantCols.includes(h));

                if (hasRelevantCols) {
                    jsonData = applyIntelligentTransformations(jsonData as DataRow[]);
                    toast({ title: 'Smart Transforms Applied', description: `Intelligent data transformations applied to ${file.name}.`, variant: 'default' });
                }
            }


            // AI suggestions for CSV
            if (jsonData && jsonData.length > 0) {
              const headers = Object.keys(jsonData[0]);
              try {
                const suggestionsOutput = await suggestTransformations({ columnHeaders: headers });
                setAiSuggestions(prev => [...(prev || []), ...suggestionsOutput.transformations]);
                totalProgress += increment / 2; // Half of increment for AI suggestion
                setProgress(totalProgress);
              } catch (aiError) {
                console.error("Error fetching AI suggestions:", aiError);
              }
            }


          } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
            jsonData = JSON.parse(text) as JsonArray; // Assuming array of objects for consistency
            if (!Array.isArray(jsonData)) jsonData = [jsonData as unknown as JsonObject]; // Ensure it's an array
          } else {
            throw new Error(`Unsupported file type: ${file.type || file.name.split('.').pop()}`);
          }
          
          newFiles.push({ file, data: jsonData, id: fileId });
          totalProgress += increment;
          setProgress(totalProgress);

          if (newFiles.length === files.length) {
            setUploadedFiles(prev => [...prev, ...newFiles]);
            processFiles(newFiles); // Process immediately or allow separate merge step
          }
        };
        reader.readAsText(file);
      } catch (err: any) {
        setError(`Error processing ${file.name}: ${err.message}`);
        toast({ title: 'File Error', description: `Failed to process ${file.name}.`, variant: 'destructive' });
        totalProgress += increment * 2; // Count full progress for failed file
        setProgress(totalProgress);
        if (newFiles.length + (Array.from(files).length - newFiles.length) === files.length && newFiles.length > 0) {
           setUploadedFiles(prev => [...prev, ...newFiles]);
           processFiles(newFiles);
        } else if (newFiles.length === 0 && files.length === 1) {
          setIsLoading(false);
        }
      }
    }
  };
  
  const processFiles = useCallback((filesToProcess: FileWithData[]) => {
    if (filesToProcess.length === 0) {
        setIsLoading(false);
        setProgress(100);
        return;
    }

    const allData = filesToProcess.map(f => f.data).filter(d => d !== null) as (JsonArray | JsonObject)[];
    if (allData.length === 0) {
        setError("No valid data to process.");
        setIsLoading(false);
        setProgress(100);
        return;
    }
    
    const merged = mergeJsonArrays(allData);
    setProcessedJson(merged);

    if (merged && merged.length > 0) {
      const sampleKeys = Object.keys(merged[0]);
      setKeyOrder(sampleKeys.map(name => ({ name, included: true })));
    } else {
      setKeyOrder([]);
    }
    toast({ title: 'Files Processed', description: `${filesToProcess.length} file(s) loaded and merged.`, variant: 'default' });
    setIsLoading(false);
    setProgress(100);
  }, []);


  useEffect(() => {
    // This effect can be used if files are uploaded incrementally and then merged by a button
    // For now, processFiles is called directly after all files are read.
  }, [uploadedFiles]);

  const handleKeyOrderChange = (index: number, direction: 'up' | 'down') => {
    setKeyOrder(prev => {
      const newOrder = [...prev];
      const item = newOrder[index];
      if (direction === 'up' && index > 0) {
        newOrder.splice(index, 1);
        newOrder.splice(index - 1, 0, item);
      } else if (direction === 'down' && index < newOrder.length - 1) {
        newOrder.splice(index, 1);
        newOrder.splice(index + 1, 0, item);
      }
      return newOrder;
    });
  };

  const handleKeyInclusionChange = (keyName: string) => {
    setKeyOrder(prev => prev.map(k => k.name === keyName ? { ...k, included: !k.included } : k));
  };

  const getFinalJson = useCallback(() => {
    if (!processedJson) return null;
    const orderedKeys = keyOrder.map(k => k.name);
    const includedKeysMap = keyOrder.reduce((acc, k) => {
      acc[k.name] = k.included;
      return acc;
    }, {} as Record<string, boolean>);
    return restructureJsonArray(processedJson, orderedKeys, includedKeysMap);
  }, [processedJson, keyOrder]);


  const handleDownload = () => {
    const finalJson = getFinalJson();
    if (finalJson) {
      downloadJson(finalJson, 'dataforge_output.json');
      toast({ title: 'Download Started', description: 'Your JSON file is being downloaded.', variant: 'default', className: 'bg-accent text-accent-foreground' });
    } else {
      toast({ title: 'No Data', description: 'No data to download.', variant: 'destructive' });
    }
  };

  const fetchColumnDescriptions = async () => {
    if (!processedJson || processedJson.length === 0) {
      toast({ title: 'No Data', description: 'Upload a CSV to generate descriptions.', variant: 'destructive' });
      return;
    }
    // Create a sample CSV string from the first few rows of processedJson
    // This assumes processedJson came from a CSV or has a similar structure.
    // If it's merged from multiple CSVs, headers should ideally be consistent.
    const headers = Object.keys(processedJson[0]);
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
  
  const finalJsonOutput = getFinalJson();
  const previewData = finalJsonOutput ? JSON.stringify(finalJsonOutput.slice(0, 5), null, 2) : "No data to display.";


  return (
    <div className="space-y-8">
      <header className="text-center py-8">
        <h1 className="text-5xl font-bold text-primary flex items-center justify-center">
          <Sparkles className="w-12 h-12 mr-3 text-accent" /> DataForge Studio
        </h1>
        <p className="text-muted-foreground text-lg mt-2">
          Convert, Merge, Edit, and Transform your data with ease.
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl"><UploadCloud className="mr-2 h-6 w-6" />Upload Files</CardTitle>
          <CardDescription>Select CSV or JSON files to process. CSVs will be converted to JSON.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="smart-transforms-switch"
              checked={applySmartTransforms}
              onCheckedChange={setApplySmartTransforms}
            />
            <Label htmlFor="smart-transforms-switch" className="text-sm font-medium">
              Apply Intelligent Transformations (for relevant CSVs)
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Automatically applies transformations like DMS to Decimal Degrees, UTM to Lat/Lon, and URL normalization if columns like 'Lat', 'Long', 'Easting/m', 'Northing/m', 'Island', 'URL' are present in your CSV.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <input
            type="file"
            multiple
            onChange={handleFileUpload}
            accept=".csv,.json"
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-colors"
            disabled={isLoading}
          />
          {isLoading && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground text-center">Processing files... {Math.round(progress)}%</p>
            </div>
          )}
          {uploadedFiles.length > 0 && !isLoading && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Uploaded Files:</h3>
              <ul className="space-y-1 text-sm list-disc list-inside">
                {uploadedFiles.map((f) => (
                  <li key={f.id} className="text-muted-foreground">{f.file.name} ({f.data ? (Array.isArray(f.data) ? f.data.length : 1) : 0} items)</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {processedJson && !isLoading && (
        <Card className="shadow-xl">
          <CardHeader>
             <div className="flex justify-between items-center">
              <CardTitle className="flex items-center text-2xl">
                <FileJson className="mr-2 h-6 w-6" /> Processed Data
              </CardTitle>
              <div className="flex space-x-2">
                <Button variant={activeTab === 'preview' ? "default" : "outline"} onClick={() => setActiveTab('preview')}>Preview</Button>
                <Button variant={activeTab === 'structure' ? "default" : "outline"} onClick={() => setActiveTab('structure')}>Edit Structure</Button>
                <Button variant={activeTab === 'ai' ? "default" : "outline"} onClick={() => setActiveTab('ai')}>AI Insights</Button>
              </div>
            </div>
            <CardDescription>Preview your merged and transformed JSON data. Edit its structure or get AI insights.</CardDescription>
          </CardHeader>
          <CardContent>
            {activeTab === 'preview' && (
               <Textarea
                value={previewData}
                readOnly
                rows={15}
                className="w-full font-mono text-xs bg-muted/30"
                placeholder="JSON output will appear here..."
              />
            )}

            {activeTab === 'structure' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-lg flex items-center"><Edit3 className="mr-2 h-5 w-5" />Edit JSON Structure</h3>
                <p className="text-sm text-muted-foreground">Drag to reorder fields, or uncheck to exclude them from the final output.</p>
                <div className="max-h-96 overflow-y-auto border rounded-md p-4 space-y-2 bg-background">
                  {keyOrder.length > 0 ? keyOrder.map((keyItem, index) => (
                    <div key={keyItem.name} className="flex items-center justify-between p-2 border rounded-md hover:bg-muted/50">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id={`key-${keyItem.name}`}
                          checked={keyItem.included}
                          onCheckedChange={() => handleKeyInclusionChange(keyItem.name)}
                        />
                        <Label htmlFor={`key-${keyItem.name}`} className="font-medium">{keyItem.name}</Label>
                      </div>
                      <div className="space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => handleKeyOrderChange(index, 'up')} disabled={index === 0}>↑</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleKeyOrderChange(index, 'down')} disabled={index === keyOrder.length - 1}>↓</Button>
                      </div>
                    </div>
                  )) : <p className="text-muted-foreground text-center">No fields to display. Ensure data is loaded.</p>}
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-lg flex items-center mb-2">
                    <Lightbulb className="mr-2 h-5 w-5 text-yellow-400" /> AI Transformation Suggestions
                  </h3>
                  {aiSuggestions && aiSuggestions.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      {aiSuggestions.map((suggestion, i) => <li key={i}>{suggestion}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No AI suggestions available for the current CSV data, or AI features are disabled.</p>
                  )}
                </div>
                <Separator />
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-lg flex items-center">
                       <Info className="mr-2 h-5 w-5 text-blue-400" /> AI Column Descriptions
                    </h3>
                    <Button onClick={fetchColumnDescriptions} variant="outline" size="sm" disabled={isLoading || !processedJson}>
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Generate Descriptions
                    </Button>
                  </div>
                  {showColumnDescriptions && columnDescriptions ? (
                     <div className="max-h-96 overflow-y-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[200px]">Column Name</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(columnDescriptions).map(([col, desc]) => (
                              <TableRow key={col}>
                                <TableCell className="font-medium">{col}</TableCell>
                                <TableCell>{desc}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Click "Generate Descriptions" to see AI-powered insights for your CSV columns.</p>
                  )}
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <Button onClick={handleDownload} disabled={!finalJsonOutput || finalJsonOutput.length === 0} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Download className="mr-2 h-5 w-5" /> Download Processed JSON
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <footer className="text-center py-6 mt-12 border-t">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} DataForge Studio. Powered by Next.js & Genkit.
        </p>
      </footer>
    </div>
  );
}

// TooltipProvider and Tooltip for the Info icon
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
