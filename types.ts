export type ImageFormat = 'jpeg' | 'png' | 'webp';

export interface CompressionSettings {
  targetSizeKb: number;
  format: 'original' | ImageFormat;
  keepResolution: boolean;
  preserveExif: boolean;
  theme: 'light' | 'dark';
}

export interface CompressionItem {
  id: string;
  name: string;
  originalFile: File;
  originalSize: number;
  originalWidth: number;
  originalHeight: number;
  originalDataUrl: string;
  
  // Compression results
  compressedDataUrl: string | null;
  compressedBlob: Blob | null;
  compressedSize: number | null;
  compressedWidth: number | null;
  compressedHeight: number | null;
  
  // Stats
  qualityUsed: number;
  scaleUsed: number;
  reductionPercentage: number | null;
  durationMs: number | null;
  
  // Status
  status: 'idle' | 'compressing' | 'completed' | 'failed';
  progress: number;
  error: string | null;
}
