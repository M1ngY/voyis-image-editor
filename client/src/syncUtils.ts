import { ImageItem } from './Gallery';

const LOCAL_STORAGE_KEY = 'voyis_local_images';
const LAST_SYNC_KEY = 'voyis_last_sync';

export interface LocalImageItem extends ImageItem {
  localId?: string;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  error?: string;
}

/**
 * Load images from local storage
 */
export const loadLocalImages = (): LocalImageItem[] => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((img: LocalImageItem) => {
      const fallbackUpdatedAt = img.updatedAt || img.createdAt || new Date().toISOString();
      return {
        ...img,
        updatedAt: fallbackUpdatedAt,
        thumbnail: img.thumbnail || `/thumbnails/thumb-${img.filename}`,
        original: img.original || `/uploads/images/${img.filename}`,
        mimetype: img.mimetype || 'image/jpeg',
        syncStatus: img.syncStatus || 'synced',
        lastModified:
          typeof img.lastModified === 'number'
            ? img.lastModified
            : new Date(fallbackUpdatedAt).getTime(),
      };
    });
  } catch (error) {
    console.error('Failed to load local images:', error);
    return [];
  }
};

/**
 * Save images to local storage
 */
export const saveLocalImages = (images: LocalImageItem[]): void => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(images));
  } catch (error) {
    console.error('Failed to save local images:', error);
  }
};

/**
 * Get last sync timestamp
 */
export const getLastSyncTime = (): number | null => {
  try {
    const stored = localStorage.getItem(LAST_SYNC_KEY);
    return stored ? parseInt(stored, 10) : null;
  } catch {
    return null;
  }
};

/**
 * Update last sync timestamp
 */
export const updateLastSyncTime = (): void => {
  try {
    localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
  } catch (error) {
    console.error('Failed to update last sync time:', error);
  }
};

/**
 * Add or update image in local storage
 */
export const updateLocalImage = (image: ImageItem): void => {
  const localImages = loadLocalImages();
  const existingIndex = localImages.findIndex(img => img.id === image.id);
  
  const localImage: LocalImageItem = {
    ...image,
    thumbnail: image.thumbnail || `/thumbnails/thumb-${image.filename}`,
    original: image.original || `/uploads/images/${image.filename}`,
    mimetype: image.mimetype || 'image/jpeg',
    lastModified: new Date(image.updatedAt || image.createdAt || Date.now()).getTime(),
    syncStatus: 'synced',
  };

  if (existingIndex >= 0) {
    localImages[existingIndex] = localImage;
  } else {
    localImages.push(localImage);
  }

  saveLocalImages(localImages);
};

/**
 * Mark image as pending sync
 */
export const markImagePending = (imageId: number): void => {
  const localImages = loadLocalImages();
  const image = localImages.find(img => img.id === imageId);
  if (image) {
    image.syncStatus = 'pending';
    image.lastModified = Date.now();
    saveLocalImages(localImages);
  }
};

/**
 * Remove image from local storage
 */
export const removeLocalImage = (imageId: number): void => {
  const localImages = loadLocalImages();
  const filtered = localImages.filter(img => img.id !== imageId);
  saveLocalImages(filtered);
};

/**
 * Sync local and server state
 * Strategy: Local Always Wins
 */
export const syncWithServer = async (): Promise<SyncResult> => {
  const result: SyncResult = {
    success: true,
    uploaded: 0,
    downloaded: 0,
    conflicts: 0,
  };

  try {
    const localImages = loadLocalImages();
    const payload = {
      localImages: localImages.map(img => ({
        id: img.id,
        lastModified: img.lastModified,
        syncStatus: img.syncStatus,
      })),
    };

    const response = await fetch('http://localhost:4000/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Server error: ${response.status}`);
    }

    const { addedOrUpdated = [], removed = [], conflicts = [] } = await response.json();

    for (const image of addedOrUpdated as ImageItem[]) {
      const index = localImages.findIndex(img => img.id === image.id);
      const syncedImage: LocalImageItem = {
        ...image,
        lastModified: new Date(image.updatedAt || image.createdAt || Date.now()).getTime(),
        syncStatus: 'synced',
      };
      if (index >= 0) {
        localImages[index] = syncedImage;
      } else {
        localImages.push(syncedImage);
      }
      result.downloaded++;
    }

    for (const id of removed as number[]) {
      const idx = localImages.findIndex(img => img.id === id);
      if (idx >= 0) {
        localImages.splice(idx, 1);
      }
    }

    // Resolve pending items (Local Always Wins) by marking them synced
    localImages.forEach((img) => {
      if (img.syncStatus === 'pending') {
        img.syncStatus = 'synced';
        result.uploaded++;
      }
    });

    if (Array.isArray(conflicts)) {
      result.conflicts = conflicts.length;
    }

    // Save updated local state
    saveLocalImages(localImages);
    updateLastSyncTime();

    return result;
  } catch (error: any) {
    console.error('Sync error:', error);
    result.success = false;
    result.error = error.message || 'Sync failed';
    return result;
  }
};

/**
 * Get sync status summary
 */
export const getSyncStatus = () => {
  const localImages = loadLocalImages();
  const pending = localImages.filter(img => img.syncStatus === 'pending').length;
  const conflicts = localImages.filter(img => img.syncStatus === 'conflict').length;
  const lastSync = getLastSyncTime();

  return {
    pending,
    conflicts,
    lastSync,
    total: localImages.length,
  };
};

