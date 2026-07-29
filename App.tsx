import React, { useState, useEffect } from 'react';
import { Sun, Moon, Sparkles, Image as ImageIcon, Sliders, ShieldCheck, FileText } from 'lucide-react';
import { CompressionSettings, CompressionItem } from './types';
import ImageDropzone from './components/ImageDropzone';
import CompressionControls from './components/CompressionControls';
import BeforeAfterViewer from './components/BeforeAfterViewer';
import BatchList, { formatBytes } from './components/BatchList';
import ShareModal from './components/ShareModal';
import PdfCompressorView from './components/PdfCompressorView';
import { getImageDimensions, compressImage } from './utils/compressor';

export default function App() {
  const [settings, setSettings] = useState<CompressionSettings>({
    targetSizeKb: 100,
    format: 'original',
    keepResolution: false,
    preserveExif: false,
    theme: 'light',
  });

  const [items, setItems] = useState<CompressionItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [sharingItem, setSharingItem] = useState<CompressionItem | null>(null);
  const [activeTab, setActiveTab] = useState<'image' | 'pdf'>('image');

  // Sync theme with HTML document class for Tailwind dark-mode
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  const handleToggleTheme = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light',
    }));
  };

  const handleImagesSelected = async (files: File[]) => {
    const newItems: CompressionItem[] = [];

    for (const file of files) {
      try {
        const { width, height, url } = await getImageDimensions(file);
        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          originalFile: file,
          originalSize: file.size,
          originalWidth: width,
          originalHeight: height,
          originalDataUrl: url,
          compressedDataUrl: null,
          compressedBlob: null,
          compressedSize: null,
          compressedWidth: null,
          compressedHeight: null,
          qualityUsed: 1.0,
          scaleUsed: 1.0,
          reductionPercentage: null,
          durationMs: null,
          status: 'idle',
          progress: 0,
          error: null,
        });
      } catch (err: any) {
        console.error("Error reading selected image details:", err);
      }
    }

    setItems((prev) => [...prev, ...newItems]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item) {
        if (item.originalDataUrl) URL.revokeObjectURL(item.originalDataUrl);
        if (item.compressedDataUrl) URL.revokeObjectURL(item.compressedDataUrl);
      }
      const filtered = prev.filter((it) => it.id !== id);
      
      // If deleted item was active, auto-select another completed one or reset
      if (selectedItemId === id) {
        const nextCompleted = filtered.find((it) => it.status === 'completed');
        setSelectedItemId(nextCompleted ? nextCompleted.id : null);
      }
      return filtered;
    });
  };

  const handleClearAll = () => {
    items.forEach((item) => {
      if (item.originalDataUrl) URL.revokeObjectURL(item.originalDataUrl);
      if (item.compressedDataUrl) URL.revokeObjectURL(item.compressedDataUrl);
    });
    setItems([]);
    setSelectedItemId(null);
  };

  const handleCompressAll = async () => {
    if (items.length === 0 || isCompressing) return;
    setIsCompressing(true);

    // Filter items that need compression (idle or failed)
    const targets = items.filter((it) => it.status === 'idle' || it.status === 'failed');

    // Update their status visually to 'compressing'
    setItems((prev) =>
      prev.map((it) =>
        it.status === 'idle' || it.status === 'failed'
          ? { ...it, status: 'compressing', progress: 5 }
          : it
      )
    );

    for (const item of targets) {
      try {
        const result = await compressImage(
          item.originalFile,
          item.originalDataUrl,
          settings,
          (progress) => {
            setItems((prev) =>
              prev.map((it) => (it.id === item.id ? { ...it, progress } : it))
            );
          }
        );

        const compressedUrl = URL.createObjectURL(result.blob);

        setItems((prev) =>
          prev.map((it) => {
            if (it.id === item.id) {
              const reduction = ((item.originalSize - result.blob.size) / item.originalSize) * 100;
              return {
                ...it,
                status: 'completed',
                progress: 100,
                compressedBlob: result.blob,
                compressedDataUrl: compressedUrl,
                compressedSize: result.blob.size,
                compressedWidth: result.width,
                compressedHeight: result.height,
                qualityUsed: result.qualityUsed,
                scaleUsed: result.scaleUsed,
                reductionPercentage: Math.max(0, reduction),
                durationMs: result.durationMs,
              };
            }
            return it;
          })
        );

        // Auto-select the first compressed item to showcase preview
        setSelectedItemId((prev) => (prev === null ? item.id : prev));
      } catch (err: any) {
        console.error("Compression error on item " + item.name, err);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'failed',
                  progress: 0,
                  error: err.message || 'Compression failed',
                }
              : it
          )
        );
      }
    }

    setIsCompressing(false);
  };

  const handleDownloadItem = (item: CompressionItem) => {
    if (!item.compressedDataUrl) return;
    
    const extension = settings.format === 'original' 
      ? item.originalFile.name.split('.').pop() 
      : settings.format;

    const baseName = item.originalFile.name.substring(0, item.originalFile.name.lastIndexOf('.'));
    const downloadName = `${baseName}_compressed_${settings.targetSizeKb}kb.${extension}`;

    const link = document.createElement('a');
    link.href = item.compressedDataUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareItem = async (item: CompressionItem) => {
    if (!item.compressedBlob) return;

    const extension = settings.format === 'original' 
      ? item.originalFile.name.split('.').pop() 
      : settings.format;
    const baseName = item.originalFile.name.substring(0, item.originalFile.name.lastIndexOf('.'));
    const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;

    // On supported mobile devices, trigger Web Share API
    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([item.compressedBlob], `${baseName}_compressed.${extension}`, {
          type: mimeType,
        });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Compressed Image',
            text: `Compressed to ${formatBytes(item.compressedSize || 0)} using Smart Offline Compressor`,
          });
          return; // Shared successfully via system sheet!
        }
      } catch (err) {
        console.warn("Native share failed, falling back to modal:", err);
      }
    }

    // Otherwise, show custom rich share modal fallback
    setSharingItem(item);
  };

  const handleDownloadAll = () => {
    const completedItems = items.filter((it) => it.status === 'completed' && it.compressedDataUrl);
    
    // Stagger downloads to bypass standard browser concurrent download limits
    completedItems.forEach((item, idx) => {
      setTimeout(() => {
        handleDownloadItem(item);
      }, idx * 300);
    });
  };

  // Get active item for Before/After preview
  const activeItem = items.find((it) => it.id === selectedItemId && it.status === 'completed');

  const canCompress = items.some((it) => it.status === 'idle' || it.status === 'failed');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans transition-colors duration-200" id="app-root">
      {/* Header Container */}
      <header className="border-b border-zinc-200/50 dark:border-zinc-850 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-md sticky top-0 z-30" id="app-header">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-sm shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-zinc-850 dark:text-zinc-50">
                Offline Smart Compressor
              </h1>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                100% Client-Side Privacy
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Status indicator */}
            <div className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-900 text-[10px] text-zinc-500 dark:text-zinc-400 border border-zinc-200/40 dark:border-zinc-800">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Offline Safe</span>
            </div>

            {/* Dark Mode toggle button */}
            <button
              onClick={handleToggleTheme}
              className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-850 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer transition-all"
              title={settings.theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
              id="theme-toggle-btn"
            >
              {settings.theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="max-w-6xl mx-auto px-4 py-6" id="app-main-content">
        {/* Workspace Switcher Tabs */}
        <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-2xl max-w-md mx-auto mb-8 border border-zinc-200/45 dark:border-zinc-800/80 shadow-sm" id="workspace-tabs-container">
          <button
            onClick={() => setActiveTab('image')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'image'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-md'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
            id="image-tab-toggle"
          >
            <ImageIcon className="w-4 h-4" />
            <span>Images</span>
          </button>
          <button
            onClick={() => setActiveTab('pdf')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 ${
              activeTab === 'pdf'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-md'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
            id="pdf-tab-toggle"
          >
            <FileText className="w-4 h-4" />
            <span>PDFs</span>
          </button>
        </div>

        {activeTab === 'image' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column (Dropzone & Settings) - taking 5 grid cols */}
            <section className="lg:col-span-5 flex flex-col space-y-5">
              
              {/* Image Upload Dropzone */}
              <ImageDropzone onImagesSelected={handleImagesSelected} />

              {/* Batch items list (Only if items added) */}
              <BatchList
                items={items}
                onRemoveItem={handleRemoveItem}
                onDownloadItem={handleDownloadItem}
                onShareItem={handleShareItem}
                onDownloadAll={handleDownloadAll}
                onClearAll={handleClearAll}
                selectedId={selectedItemId}
                onSelectItem={setSelectedItemId}
              />

              {/* Compression Configuration Panel */}
              <CompressionControls
                settings={settings}
                onChange={setSettings}
                onCompress={handleCompressAll}
                isCompressing={isCompressing}
                canCompress={canCompress}
                totalImages={items.filter((it) => it.status === 'idle' || it.status === 'failed').length}
              />

            </section>

            {/* Right Column (Before/After Comparative Viewer) - taking 7 grid cols */}
            <section className="lg:col-span-7 space-y-4">
              {activeItem ? (
                <BeforeAfterViewer
                  originalUrl={activeItem.originalDataUrl}
                  compressedUrl={activeItem.compressedDataUrl!}
                  originalSizeStr={formatBytes(activeItem.originalSize)}
                  compressedSizeStr={formatBytes(activeItem.compressedSize || 0)}
                />
              ) : (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl p-8 text-center flex flex-col items-center justify-center min-h-[300px] md:min-h-[440px] space-y-4" id="placeholder-comparer">
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-850 border border-zinc-150 dark:border-zinc-800 rounded-full text-zinc-400 dark:text-zinc-600 animate-pulse">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                  <div className="max-w-xs space-y-1">
                    <h3 className="font-bold text-sm text-zinc-850 dark:text-zinc-100">Before & After Comparer</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-normal">
                      Compress your selected images first to preview, compare details side-by-side, and zoom in to inspect quality differences.
                    </p>
                  </div>
                </div>
              )}
            </section>

          </div>
        ) : (
          <PdfCompressorView />
        )}
      </main>

      {/* Share Intent Fallback Modal */}
      <ShareModal
        item={sharingItem}
        onClose={() => setSharingItem(null)}
        onDownload={handleDownloadItem}
      />
    </div>
  );
}
