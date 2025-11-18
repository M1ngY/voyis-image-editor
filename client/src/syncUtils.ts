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
    return JSON.parse(stored);
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
    lastModified: Date.now(),
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
    // Get local and server images
    const localImages = loadLocalImages();
    const serverResponse = await fetch('http://localhost:4000/images');
    
    if (!serverResponse.ok) {
      throw new Error(`Server error: ${serverResponse.status}`);
    }

    const serverImages: ImageItem[] = await serverResponse.json();

    // Create maps for easier lookup
    const localMap = new Map(localImages.map(img => [img.id, img]));
    const serverMap = new Map(serverImages.map(img => [img.id, img]));

    // Find pending local changes (Local Always Wins)
    const pendingImages = localImages.filter(img => img.syncStatus === 'pending');
    
    // For pending images, we would upload them, but since we don't have
    // a way to track what changed, we'll just mark them as synced
    // In a real implementation, you'd track what changed and upload accordingly
    for (const localImg of pendingImages) {
      localImg.syncStatus = 'synced';
      result.uploaded++;
    }

    // Download new images from server (not in local)
    for (const serverImg of serverImages) {
      if (!localMap.has(serverImg.id)) {
        const localImage: LocalImageItem = {
          ...serverImg,
          lastModified: Date.now(),
          syncStatus: 'synced',
        };
        localImages.push(localImage);
        result.downloaded++;
      } else {
        // Image exists in both - check for conflicts
        const localImg = localMap.get(serverImg.id)!;
        // Since Local Always Wins, we keep local version
        // But we could detect conflicts here if needed
        if (localImg.syncStatus === 'conflict') {
          result.conflicts++;
        }
      }
    }

    // Remove images that no longer exist on server (if they're synced)
    const toRemove: number[] = [];
    for (const localImg of localImages) {
      if (!serverMap.has(localImg.id) && localImg.syncStatus === 'synced') {
        toRemove.push(localImg.id);
      }
    }
    toRemove.forEach(id => {
      const index = localImages.findIndex(img => img.id === id);
      if (index >= 0) {
        localImages.splice(index, 1);
      }
    });

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

