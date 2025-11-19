import { useEffect, useState, useRef, useMemo, type CSSProperties } from "react";
import Viewer from "./Viewer";
import {
  syncWithServer,
  updateLocalImage,
  removeLocalImage,
  getSyncStatus,
  loadLocalImages,
  type SyncResult,
} from "./syncUtils";

export interface ImageItem {
  id: number;
  filename: string;
  createdAt: string;
  updatedAt: string;
  size: number;
  mimetype: string;
  thumbnail: string;
  original: string;
}

interface UploadProgress {
  filename: string;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
}

interface UploadSummary {
  totalFiles: number;
  totalSize: number;
  success: number;
  corrupted: number;
}

type TabKey = "gallery" | "viewer";
type LogLevel = "info" | "warning" | "error";

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: LogLevel;
}

const levelColors: Record<LogLevel, string> = {
  info: "#0ea5e9",
  warning: "#f59e0b",
  error: "#ef4444",
};

type FileTypeFilter = "all" | "jpeg" | "png" | "webp" | "tiff" | "other";

const fileTypeLabels: Record<FileTypeFilter, string> = {
  all: "All",
  jpeg: "JPG / JPEG",
  png: "PNG",
  webp: "WEBP",
  tiff: "TIF / TIFF",
  other: "Other",
};

const tabButtonStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: "14px 18px",
  background: active ? "#0ea5e9" : "transparent",
  color: active ? "#fff" : "#0f172a",
  border: "none",
  borderBottom: active ? "3px solid #0ea5e9" : "3px solid transparent",
  fontWeight: 600,
  fontSize: 15,
  cursor: active ? "default" : "pointer",
  transition: "all 0.2s ease",
});

const filterPillStyle = (active: boolean): CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 999,
  border: active ? "1px solid #2563eb" : "1px solid #cbd5f5",
  background: active ? "#2563eb" : "#fff",
  color: active ? "#fff" : "#0f172a",
  fontSize: 12,
  fontWeight: 600,
  cursor: active ? "default" : "pointer",
  transition: "all 0.2s ease",
});

const logEntryStyle = (level: LogLevel): CSSProperties => ({
  borderLeft: `4px solid ${levelColors[level]}`,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  gap: 4,
});

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 24,
    background: "#e2e8f0",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxSizing: "border-box",
  },

  mainContent: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    flexGrow: 1,
    flexShrink: 1,
  },

  leftPanel: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "320px", // ← 替换 flex: "0 0 320px"
    minWidth: 280,
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 20px 35px rgba(15,23,42,0.08)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  section: {
    background: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  helperText: {
    margin: 0,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.4,
  },

  badge: {
    alignSelf: "flex-start",
    padding: "4px 8px",
    background: "#fff",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    color: "#475569",
    border: "1px solid #e2e8f0",
  },

  centerPanel: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "420px", // ← 替换 flex: "1 1 420px"
    minWidth: 320,
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 20px 35px rgba(15,23,42,0.08)",
    display: "flex",
    flexDirection: "column",
  },

  tabContent: {
    padding: 20,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 16,
  },

  card: {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    position: "relative",
    cursor: "pointer",
    background: "#fff",
    transition: "box-shadow 0.2s ease, transform 0.2s ease",
  },

  viewerPanel: {
    flex: 1,
    minHeight: 320,
    background: "#0f172a",
    borderRadius: 16,
    padding: 24,
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    textAlign: "center",
  },

  bottomPanel: {
    background: "#fff",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 15px 30px rgba(15,23,42,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  logList: {
    maxHeight: 220,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  filterPills: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },

  selectionToolbar: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  selectionActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  cardCheckbox: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 18,
    height: 18,
    cursor: "pointer",
    accentColor: "#2563eb",
    zIndex: 2,
  } as CSSProperties,
};


const formatBytes = (size: number | undefined) => {
  if (size === undefined) return "--";
  if (size === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = value < 10 && index > 0 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[index]}`;
};

const formatDate = (iso: string | undefined) => {
  if (!iso) return "--";
  return new Date(iso).toLocaleString();
};

const formatBytesDetailed = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value < 10 && index > 0 ? 1 : 0)} ${units[index]}`;
};

const resolveMimeCategory = (mime?: string): FileTypeFilter => {
  const normalized = mime?.toLowerCase() || "";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpeg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("tif")) return "tiff";
  return "other";
};

const doesMatchFilter = (image: ImageItem, filter: FileTypeFilter) => {
  if (filter === "all") return true;
  return resolveMimeCategory(image.mimetype) === filter;
};

export default function Gallery() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedImageMeta, setSelectedImageMeta] = useState<ImageItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("gallery");
  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const [viewerSize, setViewerSize] = useState({ width: 800, height: 500 });
  const [filterType, setFilterType] = useState<FileTypeFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);

  const filteredImages = useMemo(
    () => images.filter((img) => doesMatchFilter(img, filterType)),
    [images, filterType]
  );

  const selectedImages = useMemo(
    () => images.filter((img) => selectedIds.has(img.id)),
    [images, selectedIds]
  );

  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const selectionCount = selectedIds.size;
  const hasSelection = selectionCount > 0;

  const addLog = (message: string, level: LogLevel = "info") => {
    setActivityLog((prev) => {
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        message,
        level,
      };
      return [entry, ...prev].slice(0, 100);
    });
  };

  const fetchImages = () => {
    fetch("http://localhost:4000/images")
      .then((res) => res.json())
      .then((data) => {
        data.forEach((img: ImageItem) => updateLocalImage(img));
        setImages(data);
        setSyncStatus(getSyncStatus());
        addLog(`Fetched ${data.length} image(s) from server.`);
      })
      .catch((err) => {
        console.error("Fetch error:", err);
        addLog(`Failed to fetch images: ${err.message || err}`, "error");
      });
  };

  useEffect(() => {
    const localImages = loadLocalImages();
    if (localImages.length > 0) {
      setImages(localImages);
      addLog(`Loaded ${localImages.length} cached image(s).`);
    }
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(images.map((img) => img.id));
      const filtered = Array.from(prev).filter((id) => validIds.has(id));
      if (filtered.length === prev.size) {
        return prev;
      }
      return new Set(filtered);
    });
  }, [images]);

  useEffect(() => {
    if (!viewerContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setViewerSize({ width, height });
        }
      }
    });
    observer.observe(viewerContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    addLog("Sync started (Local Always Wins).");
    try {
      const result: SyncResult = await syncWithServer();
      fetchImages();
      if (result.success) {
        addLog(
          `Sync complete • uploaded ${result.uploaded}, downloaded ${result.downloaded}, conflicts ${result.conflicts}.`,
          result.conflicts > 0 ? "warning" : "info"
        );
      } else {
        addLog(`Sync failed: ${result.error || "Unknown error"}.`, "error");
        alert(`Sync failed: ${result.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("Sync error:", error);
      addLog(`Sync error: ${error.message || error}`, "error");
      alert(`Sync failed: ${error.message || "Unknown error"}`);
    } finally {
      setSyncing(false);
      setSyncStatus(getSyncStatus());
    }
  };

  const handleFilterChange = (value: FileTypeFilter) => {
    setFilterType(value);
    addLog(`Applied filter: ${fileTypeLabels[value]}`);
  };

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    if (filteredImages.length === 0) {
      addLog("No images to select for current filter.", "warning");
      return;
    }
    const ids = filteredImages.map((img) => img.id);
    setSelectedIds(new Set(ids));
    addLog(`Selected ${ids.length} image(s) based on current filter.`);
  };

  const clearSelection = () => {
    if (selectedIds.size === 0) return;
    setSelectedIds(new Set());
    addLog("Cleared selection.");
  };

  const base64ToUint8Array = (base64: string) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const uploadFiles = async (fileArray: File[]) => {
    if (!fileArray || fileArray.length === 0) {
      return;
    }

    setUploading(true);
    addLog(`Uploading ${fileArray.length} file(s).`);

    const totalSize = fileArray.reduce((acc, file) => acc + (file.size || 0), 0);
    setUploadSummary({
      totalFiles: fileArray.length,
      totalSize,
      success: 0,
      corrupted: 0,
    });

    const initialProgress: UploadProgress[] = fileArray.map((file) => ({
      filename: file.name,
      progress: 0,
      status: "uploading",
    }));
    setUploadProgress(initialProgress);

    for (let i = 0; i < fileArray.length; i += 1) {
      const file = fileArray[i];
      const formData = new FormData();
      formData.append("image", file);

      try {
        const xhr = new XMLHttpRequest();
        addLog(`Uploading ${file.name}...`);

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress((prev) =>
              prev.map((item, idx) => (idx === i ? { ...item, progress } : item))
            );
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText);
              if (result.success && result.image) {
                updateLocalImage(result.image);
              }
            } catch (error) {
              console.error("Failed to parse upload response:", error);
            }
            addLog(`Upload succeeded: ${file.name}`);
            setUploadSummary((prev) =>
              prev ? { ...prev, success: prev.success + 1 } : prev
            );
            setUploadProgress((prev) =>
              prev.map((item, idx) =>
                idx === i ? { ...item, progress: 100, status: "success" } : item
              )
            );
          } else {
            addLog(`Upload failed: ${file.name}`, "error");
             setUploadSummary((prev) =>
              prev ? { ...prev, corrupted: prev.corrupted + 1 } : prev
            );
            setUploadProgress((prev) =>
              prev.map((item, idx) =>
                idx === i
                  ? {
                      ...item,
                      status: "error",
                      error: `Upload failed: ${xhr.statusText}`,
                    }
                  : item
              )
            );
          }
        });

        xhr.addEventListener("error", () => {
          addLog(`Network error during upload: ${file.name}`, "error");
          setUploadSummary((prev) =>
            prev ? { ...prev, corrupted: prev.corrupted + 1 } : prev
          );
          setUploadProgress((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? { ...item, status: "error", error: "Network error" }
                : item
            )
          );
        });

        xhr.open("POST", "http://localhost:4000/upload");
        xhr.send(formData);

        await new Promise<void>((resolve) => {
          xhr.addEventListener("loadend", () => resolve());
          xhr.addEventListener("error", () => resolve());
        });

        if (i < fileArray.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error("Upload error:", error);
        addLog(`Upload failed: ${file.name}`, "error");
        setUploadSummary((prev) =>
          prev ? { ...prev, corrupted: prev.corrupted + 1 } : prev
        );
        setUploadProgress((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "error", error: "Upload failed" } : item
          )
        );
      }
    }

    setTimeout(() => {
      fetchImages();
      setUploading(false);
      setUploadProgress([]);
      setSyncStatus(getSyncStatus());
      addLog("Upload batch completed.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }, 500);
  };

  const handleFileSelect = async () => {
    if (window.voyisAPI?.selectImages) {
      try {
        const selectedFiles = await window.voyisAPI.selectImages();
        if (!selectedFiles || selectedFiles.length === 0) {
          return;
        }
        addLog(`Selected ${selectedFiles.length} file(s) via native dialog.`);

        const browserFiles = selectedFiles.map((file) => {
          const bytes = base64ToUint8Array(file.data);
          return new File([bytes], file.name, {
            type: file.type || "application/octet-stream",
            lastModified: file.lastModified || Date.now(),
          });
        });

        await uploadFiles(browserFiles);
        return;
      } catch (error) {
        console.error("Native file dialog failed, falling back to input picker.", error);
        addLog("Native file picker failed. Falling back to standard uploader.", "warning");
        alert("Native file picker failed. Falling back to standard uploader.");
      }
    }

    fileInputRef.current?.click();
  };

  const handleFolderConfigUpload = async () => {
    if (!window.voyisAPI?.selectFolderConfig) {
      alert("Folder config upload is only available inside Electron.");
      return;
    }

    try {
      const result = await window.voyisAPI.selectFolderConfig();
      if (!result || !result.files || result.files.length === 0) {
        addLog("Folder config selection cancelled.", "warning");
        return;
      }

      addLog(
        `Loaded folder config (${result.files.length} file(s)) from ${result.configPath}.`
      );

      const browserFiles = result.files.map((file) => {
        const bytes = base64ToUint8Array(file.data);
        return new File([bytes], file.name, {
          type: file.type || "application/octet-stream",
          lastModified: file.lastModified || Date.now(),
        });
      });

      await uploadFiles(browserFiles);
    } catch (error: any) {
      console.error("Folder config import error:", error);
      const message = error?.message || "Unknown error";
      addLog(`Folder config import failed: ${message}`, "error");
      alert(`Failed to import folder config: ${message}`);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    addLog(`Selected ${files.length} file(s) via fallback picker.`);
    await uploadFiles(Array.from(files));
  };

  const handleCardDoubleClick = (img: ImageItem) => {
    setSelectedImageMeta(img);
    setActiveTab("viewer");
    addLog(`Opened ${img.filename} in viewer.`);
  };

  const deleteImage = async (
    id: number,
    filename: string,
    { confirmBefore = true, logIndividual = true }: { confirmBefore?: boolean; logIndividual?: boolean } = {}
  ) => {
    if (confirmBefore && !confirm(`Are you sure you want to delete "${filename}"?`)) {
      return false;
    }
    if (logIndividual) {
      addLog(`Deleting ${filename}...`);
    }

    const releaseImageResources = () => {
      const imgs = document.querySelectorAll("img");
      imgs.forEach((img) => {
        try {
          const src = img.src;
          if (src && (src.includes(filename) || src.includes(`thumb-${filename}`))) {
            img.src = "";
            if (src.startsWith("blob:")) {
              URL.revokeObjectURL(src);
            }
          }
        } catch {
          // ignore
        }
      });

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => caches.delete(key));
        });
      }
    };

    releaseImageResources();

    setDeletingId(id);
    try {
      const response = await fetch(`http://localhost:4000/images/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Server error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
          if (errorJson.details) {
            errorMessage += `: ${errorJson.details}`;
          }
        } catch {
          errorMessage = errorText || errorMessage;
        }
        if (logIndividual) {
          addLog(`Failed to delete ${filename}: ${errorMessage}`, "error");
        }
        if (confirmBefore) {
          alert(`Failed to delete: ${errorMessage}`);
        }
        return false;
      }

      await response.json();
      removeLocalImage(id);
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (selectedImageMeta?.id === id) {
        setSelectedImageMeta(null);
        setActiveTab("gallery");
      }
      if (logIndividual) {
        addLog(`Deleted ${filename}.`);
      }
      fetchImages();
      setSyncStatus(getSyncStatus());
      return true;
    } catch (error: any) {
      const errorMessage = error.message || "Network error or server unavailable";
      if (logIndividual) {
        addLog(`Failed to delete ${filename}: ${errorMessage}`, "error");
      }
      if (confirmBefore) {
        alert(`Failed to delete image: ${errorMessage}`);
      }
      return false;
    } finally {
      setDeletingId(null);
    }
  };

  const handleBatchDelete = async () => {
    if (!hasSelection || batchDeleting) return;
    if (!confirm(`Delete ${selectionCount} selected image(s)? This cannot be undone.`)) {
      return;
    }
    setBatchDeleting(true);
    try {
      for (const img of selectedImages) {
        // eslint-disable-next-line no-await-in-loop
        await deleteImage(img.id, img.filename, { confirmBefore: false, logIndividual: false });
      }
      addLog(`Batch deleted ${selectionCount} image(s).`);
      fetchImages();
    } catch (error: any) {
      addLog(`Batch delete failed: ${error?.message || error}`, "error");
      alert(`Batch delete failed: ${error?.message || "Unknown error"}`);
    } finally {
      setBatchDeleting(false);
      setSelectedIds(new Set());
    }
  };

  const handleBatchDownload = async () => {
    if (!hasSelection || batchDownloading) return;
    setBatchDownloading(true);
    try {
      const response = await fetch("http://localhost:4000/images/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIdList }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server error (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = url;
      link.download = `voyis-export-${timestamp}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      addLog(`Exported ${selectionCount} image(s) to ZIP.`);
    } catch (error: any) {
      const message = error?.message || "Unknown error";
      addLog(`Batch export failed: ${message}`, "error");
      alert(`Failed to download images: ${message}`);
    } finally {
      setBatchDownloading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.mainContent}>
        <aside style={styles.leftPanel}>
          <div style={styles.section}>
            <h3 style={{ margin: 0 }}>Control Panel</h3>
            <p style={styles.helperText}>
              Upload new imagery and keep local cache aligned with the server database.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
              <button
                onClick={handleFileSelect}
                disabled={uploading || syncing}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 600,
                  cursor: uploading || syncing ? "not-allowed" : "pointer",
                  background: uploading || syncing ? "#94a3b8" : "#2563eb",
                  color: "#fff",
                  flex: "1 1 120px",
                }}
              >
                📤 Upload
              </button>
              <button
                onClick={handleSync}
                disabled={syncing || uploading}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 600,
                  cursor: syncing || uploading ? "not-allowed" : "pointer",
                  background: syncing || uploading ? "#94a3b8" : "#22c55e",
                  color: "#fff",
                  flex: "1 1 120px",
                }}
              >
                {syncing ? "⏳ Syncing..." : "🔄 Sync"}
              </button>
              <button
                onClick={handleFolderConfigUpload}
                disabled={uploading || syncing}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 600,
                  cursor: uploading || syncing ? "not-allowed" : "pointer",
                  background: uploading || syncing ? "#94a3b8" : "#6b21a8",
                  color: "#fff",
                  flex: "1 1 120px",
                }}
              >
                📂 Folder Config
              </button>
            </div>
            {uploading && (
              <span style={styles.helperText}>
                Uploading {uploadProgress.filter((p) => p.status === "success").length}/
                {uploadProgress.length}
              </span>
            )}
            {syncStatus.pending > 0 && (
              <span style={{ ...styles.badge, background: "#fffbeb", color: "#92400e" }}>
                {syncStatus.pending} pending changes
              </span>
            )}
            {syncStatus.lastSync && (
              <span style={styles.helperText}>
                Last sync: {new Date(syncStatus.lastSync).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div style={styles.section}>
            <h4 style={{ margin: 0 }}>Sync Strategy</h4>
            <p style={styles.helperText}>
              Strategy: <strong>Local Always Wins</strong>. Local edits overwrite remote data to
              preserve operator workflow. Risk: remote-only changes may be overwritten silently.
            </p>
          </div>

          <div style={styles.section}>
            <h4 style={{ margin: 0 }}>Selected Image Metadata</h4>
            {selectedImageMeta ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <li>
                  <strong>Name:</strong> {selectedImageMeta.filename}
                </li>
                <li>
                  <strong>Captured:</strong> {formatDate(selectedImageMeta.createdAt)}
                </li>
                <li>
                  <strong>Size:</strong> {formatBytes(selectedImageMeta.size)}
                </li>
                <li>
                  <strong>ID:</strong> {selectedImageMeta.id}
                </li>
                <li>
                  <strong>Type:</strong> {selectedImageMeta.mimetype}
                </li>
              </ul>
            ) : (
              <p style={styles.helperText}>Double-click a thumbnail to inspect file metadata.</p>
            )}
          </div>

          <div style={styles.section}>
            <h4 style={{ margin: 0 }}>Filter by File Type</h4>
            <p style={styles.helperText}>Quickly narrow down results based on MIME type.</p>
            <div style={styles.filterPills}>
              {(Object.keys(fileTypeLabels) as FileTypeFilter[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={filterType === type}
                  onClick={() => handleFilterChange(type)}
                  style={filterPillStyle(filterType === type)}
                >
                  {fileTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h4 style={{ margin: 0 }}>Selection & Batch Actions</h4>
            <p style={styles.helperText}>
              Selected {selectionCount} / {filteredImages.length || images.length} (filter:{" "}
              {fileTypeLabels[filterType]})
            </p>
            <div style={styles.selectionActions}>
              <button
                onClick={selectAllFiltered}
                disabled={filteredImages.length === 0}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 600,
                  flex: "1 1 120px",
                  background: filteredImages.length === 0 ? "#cbd5f5" : "#0ea5e9",
                  color: "#fff",
                  cursor: filteredImages.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                Select filtered
              </button>
              <button
                onClick={clearSelection}
                disabled={!hasSelection}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5f5",
                  fontWeight: 600,
                  flex: "1 1 120px",
                  background: "#fff",
                  color: hasSelection ? "#0f172a" : "#94a3b8",
                  cursor: hasSelection ? "pointer" : "not-allowed",
                }}
              >
                Clear selection
              </button>
            </div>
            <div style={styles.selectionActions}>
              <button
                onClick={handleBatchDownload}
                disabled={!hasSelection || batchDownloading}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 600,
                  flex: "1 1 140px",
                  background: !hasSelection || batchDownloading ? "#94a3b8" : "#2563eb",
                  color: "#fff",
                  cursor: !hasSelection || batchDownloading ? "not-allowed" : "pointer",
                }}
              >
                {batchDownloading ? "⬇️ Exporting..." : "⬇️ Download ZIP"}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={!hasSelection || batchDeleting}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 600,
                  flex: "1 1 140px",
                  background: !hasSelection || batchDeleting ? "#fca5a5" : "#dc2626",
                  color: "#fff",
                  cursor: !hasSelection || batchDeleting ? "not-allowed" : "pointer",
                }}
              >
                {batchDeleting ? "🗑️ Deleting..." : "🗑️ Delete Selected"}
              </button>
            </div>
          </div>
        </aside>

        <section style={styles.centerPanel}>
          <div style={{ display: "flex" }}>
            {(["gallery", "viewer"] as TabKey[]).map((tab) => (
              <button
                key={tab}
                style={tabButtonStyle(activeTab === tab)}
                onClick={() => setActiveTab(tab)}
                disabled={activeTab === tab}
              >
                {tab === "gallery" ? "📚 Gallery" : "🖼️ Single Viewer"}
              </button>
            ))}
          </div>
          <div style={styles.tabContent}>
            {activeTab === "gallery" ? (
              <>
      {uploadSummary && (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            background: "#e0f2fe",
            borderRadius: 12,
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            fontSize: 14,
          }}
        >
          <div>
            <strong>Total files:</strong> {uploadSummary.totalFiles}
          </div>
          <div>
            <strong>Total size:</strong> {formatBytesDetailed(uploadSummary.totalSize)}
          </div>
          <div>
            <strong>Uploaded:</strong> {uploadSummary.success}
          </div>
          <div style={{ color: uploadSummary.corrupted > 0 ? "#dc2626" : "#0f172a" }}>
            <strong>Corrupted:</strong> {uploadSummary.corrupted}
          </div>
        </div>
      )}

      {uploadProgress.length > 0 && (
                  <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16 }}>
                    {uploadProgress.map((progress, idx) => (
                      <div key={idx} style={{ marginBottom: 10 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                            fontSize: 13,
                          }}
                        >
                          <span>{progress.filename}</span>
                          <span
                            style={{
                              color:
                                progress.status === "success"
                                  ? "#16a34a"
                                  : progress.status === "error"
                                  ? "#dc2626"
                                  : "#475569",
                              fontWeight: 600,
                            }}
                          >
                            {progress.status === "success"
                              ? "✓"
                              : progress.status === "error"
                              ? "✗"
                              : `${progress.progress}%`}
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: 6,
                            background: "#e2e8f0",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${progress.progress}%`,
                              height: "100%",
                              background:
                                progress.status === "success"
                                  ? "#22c55e"
                                  : progress.status === "error"
                                  ? "#ef4444"
                                  : "#3b82f6",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                        {progress.error && (
                          <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                            {progress.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {filteredImages.length === 0 ? (
                  <div
                    style={{
                      padding: 40,
                      textAlign: "center",
                      border: "1px dashed #cbd5f5",
                      borderRadius: 12,
                      color: "#94a3b8",
                    }}
                  >
                    No images match the current filter ({fileTypeLabels[filterType]}).
                  </div>
                ) : (
                  <div style={styles.galleryGrid}>
                    {filteredImages.map((img) => {
                      const isSelected = selectedIds.has(img.id);
                      return (
                        <div
                          key={img.id}
                          style={{
                            ...styles.card,
                            border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                            boxShadow: isSelected
                              ? "0 0 0 3px rgba(37,99,235,0.12)"
                              : "0 20px 35px rgba(15,23,42,0.08)",
                          }}
                          onDoubleClick={() => handleCardDoubleClick(img)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => {
                              event.stopPropagation();
                              toggleSelection(img.id);
                            }}
                            style={styles.cardCheckbox}
                          />
                          <img
                            src={`http://localhost:4000${img.thumbnail}`}
                            style={{ width: "100%", borderRadius: 8, pointerEvents: "none" }}
                            alt={img.filename}
                            draggable={false}
                          />
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{img.filename}</div>
                          <div style={{ fontSize: 12, color: "#64748b", display: "flex", flexDirection: "column", gap: 2 }}>
                            <span>{formatBytes(img.size)} • {new Date(img.createdAt).toLocaleDateString()}</span>
                            <span>Type: {img.mimetype}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteImage(img.id, img.filename);
                            }}
                            disabled={deletingId === img.id}
                            style={{
                              position: "absolute",
                              top: 8,
                              right: 8,
                              padding: "4px 8px",
                              fontSize: 12,
                              border: "none",
                              borderRadius: 6,
                              background: deletingId === img.id ? "#94a3b8" : "rgba(220,53,69,0.9)",
                              color: "#fff",
                              cursor: deletingId === img.id ? "not-allowed" : "pointer",
                              fontWeight: 600,
                            }}
                          >
                            {deletingId === img.id ? "..." : "✕"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div style={styles.viewerPanel} ref={viewerContainerRef}>
                {selectedImageMeta ? (
                  <Viewer
                    mode="embedded"
                    containerSize={viewerSize}
                    imageUrl={`http://localhost:4000${selectedImageMeta.original ?? `/uploads/images/${selectedImageMeta.filename}`}`}
                    onClose={() => {
                      setSelectedImageMeta(null);
                      setActiveTab("gallery");
                    }}
                    onUploadSuccess={() => {
                      fetchImages();
                      setSelectedImageMeta(null);
                      setActiveTab("gallery");
                    }}
                  />
                ) : (
                  <p style={{ fontSize: 14, color: "#cbd5f5" }}>
                    Double-click an image from the gallery to launch the viewer here.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <section style={styles.bottomPanel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Activity Log</h3>
          <button
            onClick={() => setActivityLog([])}
            style={{
              border: "none",
              background: "transparent",
              color: "#2563eb",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
        <div style={styles.logList}>
          {activityLog.length === 0 ? (
            <p style={{ margin: 0, color: "#94a3b8" }}>No activity yet.</p>
          ) : (
            activityLog.map((entry) => (
              <div key={entry.id} style={logEntryStyle(entry.level)}>
                <span style={{ fontSize: 12, color: "#64748b" }}>{entry.timestamp}</span>
                <span style={{ fontSize: 14 }}>{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

    </div>
  );
}
