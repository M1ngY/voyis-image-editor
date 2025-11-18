import { useEffect, useState, useRef } from "react";
import Viewer from "./Viewer";
import { 
  syncWithServer, 
  updateLocalImage, 
  removeLocalImage, 
  markImagePending,
  getSyncStatus,
  loadLocalImages,
  type SyncResult 
} from "./syncUtils";

export interface ImageItem {
  id: number;
  filename: string;
  createdAt: string;
  size: number;
  thumbnail: string;
}

interface UploadProgress {
  filename: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

export default function Gallery() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = () => {
    fetch("http://localhost:4000/images")
      .then(res => res.json())
      .then(data => {
        console.log("Fetched images:", data);
        // Update local storage with server data
        data.forEach((img: ImageItem) => updateLocalImage(img));
        setImages(data);
        setSyncStatus(getSyncStatus());
      })
      .catch(err => console.error("Fetch error:", err));
  };

  useEffect(() => {
    // Load from local storage first for faster initial render
    const localImages = loadLocalImages();
    if (localImages.length > 0) {
      setImages(localImages);
    }
    
    // Then fetch from server
    fetchImages();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result: SyncResult = await syncWithServer();
      
      if (result.success) {
        // Refresh images after sync
        fetchImages();
        
        // Show sync summary
        const message = [
          `Sync completed!`,
          `Uploaded: ${result.uploaded}`,
          `Downloaded: ${result.downloaded}`,
          result.conflicts > 0 ? `Conflicts: ${result.conflicts}` : null,
        ].filter(Boolean).join('\n');
        
        alert(message);
      } else {
        alert(`Sync failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      alert(`Sync failed: ${error.message || 'Unknown error'}`);
    } finally {
      setSyncing(false);
      setSyncStatus(getSyncStatus());
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setUploading(true);
    
    // Initialize progress for all files
    const initialProgress: UploadProgress[] = fileArray.map(file => ({
      filename: file.name,
      progress: 0,
      status: 'uploading'
    }));
    setUploadProgress(initialProgress);

    // Upload files sequentially
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const formData = new FormData();
      formData.append('image', file);

      try {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(prev => 
              prev.map((item, idx) => 
                idx === i ? { ...item, progress } : item
              )
            );
          }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText);
              if (result.success && result.image) {
                // Update local storage with uploaded image
                updateLocalImage({
                  id: result.image.id,
                  filename: result.image.filename,
                  createdAt: result.image.createdAt,
                  size: result.image.size,
                  thumbnail: `/thumbnails/${result.thumbnail}`,
                });
              }
            } catch (e) {
              console.error('Failed to parse upload response:', e);
            }
            
            setUploadProgress(prev => 
              prev.map((item, idx) => 
                idx === i ? { ...item, progress: 100, status: 'success' } : item
              )
            );
          } else {
            setUploadProgress(prev => 
              prev.map((item, idx) => 
                idx === i ? { ...item, status: 'error', error: `Upload failed: ${xhr.statusText}` } : item
              )
            );
          }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
          setUploadProgress(prev => 
            prev.map((item, idx) => 
              idx === i ? { ...item, status: 'error', error: 'Network error' } : item
            )
          );
        });

        xhr.open('POST', 'http://localhost:4000/upload');
        xhr.send(formData);

        // Wait for this upload to complete before starting next
        await new Promise<void>((resolve) => {
          xhr.addEventListener('loadend', () => resolve());
          xhr.addEventListener('error', () => resolve());
        });

        // Small delay between uploads
        if (i < fileArray.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error('Upload error:', error);
        setUploadProgress(prev => 
          prev.map((item, idx) => 
            idx === i ? { ...item, status: 'error', error: 'Upload failed' } : item
          )
        );
      }
    }

    // Refresh gallery after all uploads
    setTimeout(() => {
      fetchImages();
      setUploading(false);
      setUploadProgress([]);
      setSyncStatus(getSyncStatus());
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, 500);
  };

  const handleDelete = async (id: number, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    setDeletingId(id);
    try {
      console.log('Deleting image with ID:', id);
      const response = await fetch(`http://localhost:4000/images/${id}`, {
        method: 'DELETE',
      });

      console.log('Delete response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Delete failed:', response.status, errorText);
        let errorMessage = `Server error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
          if (errorJson.details) {
            errorMessage += ': ' + errorJson.details;
          }
        } catch {
          errorMessage = errorText || errorMessage;
        }
        alert(`Failed to delete: ${errorMessage}`);
        return;
      }

      const result = await response.json();
      console.log('Delete result:', result);

      // Remove from local storage
      removeLocalImage(id);
      
      // Refresh gallery after successful deletion
      fetchImages();
      setSyncStatus(getSyncStatus());
    } catch (error: any) {
      console.error('Delete error:', error);
      const errorMessage = error.message || 'Network error or server unavailable';
      alert(`Failed to delete image: ${errorMessage}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Image Gallery</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {uploading && (
            <div style={{ fontSize: 14, color: '#666' }}>
              Uploading... ({uploadProgress.filter(p => p.status === 'success').length}/{uploadProgress.length})
            </div>
          )}
          {syncStatus.pending > 0 && (
            <div style={{ fontSize: 12, color: '#ff9800', padding: '4px 8px', background: '#fff3cd', borderRadius: 4 }}>
              {syncStatus.pending} pending
            </div>
          )}
          {syncStatus.lastSync && (
            <div style={{ fontSize: 11, color: '#666' }}>
              Last sync: {new Date(syncStatus.lastSync).toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={handleSync}
            disabled={syncing || uploading}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              border: 'none',
              borderRadius: 6,
              background: syncing || uploading ? '#ccc' : '#28a745',
              color: 'white',
              cursor: syncing || uploading ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
          <button
            onClick={handleFileSelect}
            disabled={uploading || syncing}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              border: 'none',
              borderRadius: 6,
              background: uploading || syncing ? '#ccc' : '#007bff',
              color: 'white',
              cursor: uploading || syncing ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            📤 Upload Images
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {uploadProgress.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
          {uploadProgress.map((progress, idx) => (
            <div key={idx} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{progress.filename}</span>
                <span style={{ fontSize: 12, color: progress.status === 'success' ? 'green' : progress.status === 'error' ? 'red' : '#666' }}>
                  {progress.status === 'success' ? '✓' : progress.status === 'error' ? '✗' : `${progress.progress}%`}
                </span>
              </div>
              <div style={{ width: '100%', height: 4, background: '#ddd', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${progress.progress}%`,
                    height: '100%',
                    background: progress.status === 'success' ? '#28a745' : progress.status === 'error' ? '#dc3545' : '#007bff',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              {progress.error && (
                <div style={{ fontSize: 11, color: 'red', marginTop: 4 }}>{progress.error}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 200px)",
          gap: "16px",
        }}
      >
        {images.map(img => (
          <div
            key={img.id}
            style={{
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 8,
              cursor: "pointer",
              userSelect: "none",
              position: "relative",
            }}
            onDoubleClick={() => {
              setSelectedImage(`http://localhost:4000/uploads/images/${img.filename}`);
            }}
          >
            <img
              src={`http://localhost:4000${img.thumbnail}`}
              style={{ width: "100%", borderRadius: 4, pointerEvents: "none" }}
              alt={img.filename}
              draggable={false}
            />
            <div style={{ fontSize: 12, marginTop: 4 }}>{img.filename}</div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(img.id, img.filename);
              }}
              disabled={deletingId === img.id}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                padding: "4px 8px",
                fontSize: 12,
                border: "none",
                borderRadius: 4,
                background: deletingId === img.id ? "#ccc" : "rgba(220, 53, 69, 0.9)",
                color: "white",
                cursor: deletingId === img.id ? "not-allowed" : "pointer",
                fontWeight: 500,
                opacity: 0.9,
              }}
              onMouseEnter={(e) => {
                if (deletingId !== img.id) {
                  e.currentTarget.style.opacity = "1";
                }
              }}
              onMouseLeave={(e) => {
                if (deletingId !== img.id) {
                  e.currentTarget.style.opacity = "0.9";
                }
              }}
            >
              {deletingId === img.id ? "..." : "✕"}
            </button>
          </div>
        ))}
      </div>

      {/* Viewer Modal */}
      {selectedImage && (
        <Viewer
          imageUrl={selectedImage}
          onClose={() => setSelectedImage(null)}
          onUploadSuccess={() => {
            fetchImages(); // Refresh gallery after upload
            setSelectedImage(null);
          }}
        />
      )}
    </div>
  );
}
