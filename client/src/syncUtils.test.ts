import {
  loadLocalImages,
  saveLocalImages,
  getLastSyncTime,
  updateLastSyncTime,
  updateLocalImage,
  markImagePending,
  removeLocalImage,
  getSyncStatus,
  syncWithServer,
  type LocalImageItem,
} from './syncUtils';
import { ImageItem } from './Gallery';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Override the mock from setupTests
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Mock fetch
global.fetch = jest.fn();

describe('syncUtils', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('loadLocalImages', () => {
    it('should return empty array when localStorage is empty', () => {
      expect(loadLocalImages()).toEqual([]);
    });

    it('should load images from localStorage', () => {
      const mockImages: LocalImageItem[] = [
        {
          id: 1,
          filename: 'test.jpg',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          size: 1000,
          mimetype: 'image/jpeg',
          thumbnail: '/thumbnails/thumb-test.jpg',
          original: '/uploads/images/test.jpg',
          lastModified: Date.now(),
          syncStatus: 'synced',
        },
      ];

      localStorage.setItem('voyis_local_images', JSON.stringify(mockImages));
      const result = loadLocalImages();
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('test.jpg');
    });

    it('should handle invalid JSON gracefully', () => {
      localStorage.setItem('voyis_local_images', 'invalid json');
      expect(loadLocalImages()).toEqual([]);
    });

    it('should provide default values for missing fields', () => {
      const incompleteImage = {
        id: 1,
        filename: 'test.jpg',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        size: 1000,
        mimetype: 'image/jpeg',
      };

      localStorage.setItem('voyis_local_images', JSON.stringify([incompleteImage]));
      const result = loadLocalImages();
      expect(result[0]).toHaveProperty('thumbnail');
      expect(result[0]).toHaveProperty('syncStatus', 'synced');
    });
  });

  describe('saveLocalImages', () => {
    it('should save images to localStorage', () => {
      const images: LocalImageItem[] = [
        {
          id: 1,
          filename: 'test.jpg',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          size: 1000,
          mimetype: 'image/jpeg',
          thumbnail: '/thumbnails/thumb-test.jpg',
          original: '/uploads/images/test.jpg',
          lastModified: Date.now(),
          syncStatus: 'synced',
        },
      ];

      saveLocalImages(images);
      const stored = localStorage.getItem('voyis_local_images');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toEqual(images);
    });
  });

  describe('getLastSyncTime', () => {
    it('should return null when no sync time is stored', () => {
      expect(getLastSyncTime()).toBeNull();
    });

    it('should return stored sync time', () => {
      const timestamp = Date.now();
      localStorage.setItem('voyis_last_sync', timestamp.toString());
      expect(getLastSyncTime()).toBe(timestamp);
    });
  });

  describe('updateLastSyncTime', () => {
    it('should update sync time in localStorage', () => {
      updateLastSyncTime();
      const stored = localStorage.getItem('voyis_last_sync');
      expect(stored).toBeTruthy();
      expect(Number(stored)).toBeCloseTo(Date.now(), -2); // Within 100ms
    });
  });

  describe('updateLocalImage', () => {
    it('should add new image to localStorage', () => {
      const image: ImageItem = {
        id: 1,
        filename: 'new.jpg',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        size: 1000,
        mimetype: 'image/jpeg',
        thumbnail: '/thumbnails/thumb-new.jpg',
        original: '/uploads/images/new.jpg',
      };

      updateLocalImage(image);
      const images = loadLocalImages();
      expect(images).toHaveLength(1);
      expect(images[0].id).toBe(1);
      expect(images[0].syncStatus).toBe('synced');
    });

    it('should update existing image in localStorage', () => {
      const existing: LocalImageItem = {
        id: 1,
        filename: 'old.jpg',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        size: 1000,
        mimetype: 'image/jpeg',
        thumbnail: '/thumbnails/thumb-old.jpg',
        original: '/uploads/images/old.jpg',
        lastModified: Date.now(),
        syncStatus: 'synced',
      };

      saveLocalImages([existing]);

      const updated: ImageItem = {
        ...existing,
        filename: 'updated.jpg',
      };

      updateLocalImage(updated);
      const images = loadLocalImages();
      expect(images).toHaveLength(1);
      expect(images[0].filename).toBe('updated.jpg');
    });
  });

  describe('markImagePending', () => {
    it('should mark image as pending', () => {
      const image: LocalImageItem = {
        id: 1,
        filename: 'test.jpg',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        size: 1000,
        mimetype: 'image/jpeg',
        thumbnail: '/thumbnails/thumb-test.jpg',
        original: '/uploads/images/test.jpg',
        lastModified: Date.now(),
        syncStatus: 'synced',
      };

      saveLocalImages([image]);
      markImagePending(1);
      const images = loadLocalImages();
      expect(images[0].syncStatus).toBe('pending');
    });

    it('should not affect non-existent images', () => {
      markImagePending(999);
      const images = loadLocalImages();
      expect(images).toHaveLength(0);
    });
  });

  describe('removeLocalImage', () => {
    it('should remove image from localStorage', () => {
      const images: LocalImageItem[] = [
        {
          id: 1,
          filename: 'test1.jpg',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          size: 1000,
          mimetype: 'image/jpeg',
          thumbnail: '/thumbnails/thumb-test1.jpg',
          original: '/uploads/images/test1.jpg',
          lastModified: Date.now(),
          syncStatus: 'synced',
        },
        {
          id: 2,
          filename: 'test2.jpg',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          size: 2000,
          mimetype: 'image/jpeg',
          thumbnail: '/thumbnails/thumb-test2.jpg',
          original: '/uploads/images/test2.jpg',
          lastModified: Date.now(),
          syncStatus: 'synced',
        },
      ];

      saveLocalImages(images);
      removeLocalImage(1);
      const result = loadLocalImages();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });
  });

  describe('getSyncStatus', () => {
    it('should return correct sync status', () => {
      const images: LocalImageItem[] = [
        {
          id: 1,
          filename: 'synced.jpg',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          size: 1000,
          mimetype: 'image/jpeg',
          thumbnail: '/thumbnails/thumb-synced.jpg',
          original: '/uploads/images/synced.jpg',
          lastModified: Date.now(),
          syncStatus: 'synced',
        },
        {
          id: 2,
          filename: 'pending.jpg',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          size: 2000,
          mimetype: 'image/jpeg',
          thumbnail: '/thumbnails/thumb-pending.jpg',
          original: '/uploads/images/pending.jpg',
          lastModified: Date.now(),
          syncStatus: 'pending',
        },
      ];

      saveLocalImages(images);
      updateLastSyncTime();
      const status = getSyncStatus();
      expect(status.total).toBe(2);
      expect(status.pending).toBe(1);
      expect(status.conflicts).toBe(0);
      expect(status.lastSync).toBeTruthy();
    });
  });

  describe('syncWithServer', () => {
    it('should successfully sync with server', async () => {
      const mockResponse = {
        addedOrUpdated: [
          {
            id: 1,
            filename: 'server.jpg',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            size: 1000,
            mimetype: 'image/jpeg',
            thumbnail: '/thumbnails/thumb-server.jpg',
            original: '/uploads/images/server.jpg',
          },
        ],
        removed: [],
        conflicts: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await syncWithServer();
      expect(result.success).toBe(true);
      expect(result.downloaded).toBe(1);
      expect(result.uploaded).toBe(0);
      expect(result.conflicts).toBe(0);
    });

    it('should handle server errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      const result = await syncWithServer();
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await syncWithServer();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should process pending items as uploaded', async () => {
      const pendingImage: LocalImageItem = {
        id: 1,
        filename: 'pending.jpg',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        size: 1000,
        mimetype: 'image/jpeg',
        thumbnail: '/thumbnails/thumb-pending.jpg',
        original: '/uploads/images/pending.jpg',
        lastModified: Date.now(),
        syncStatus: 'pending',
      };

      saveLocalImages([pendingImage]);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          addedOrUpdated: [],
          removed: [],
          conflicts: [],
        }),
      });

      const result = await syncWithServer();
      expect(result.uploaded).toBe(1);
      const images = loadLocalImages();
      expect(images[0].syncStatus).toBe('synced');
    });
  });
});

