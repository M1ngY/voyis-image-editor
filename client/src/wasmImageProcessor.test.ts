import {
  processImageWithWASM,
  processImageToDataURL,
  type ProcessOptions,
} from './wasmImageProcessor';

// Mock @squoosh/lib - will be loaded dynamically
// For testing, we'll mock the native WebP encoding path
// Canvas and Image mocks are provided in setupTests.ts

// Mock @squoosh/lib to avoid loading issues in test environment
jest.mock('@squoosh/lib', () => {
  const mockImage = {
    bitmap: {
      width: 1000,
      height: 800,
    },
    preprocess: jest.fn().mockResolvedValue(undefined),
    encode: jest.fn().mockImplementation(async (options: any) => {
      const result: Record<string, { binary: Uint8Array }> = {};

      if (options?.webp) {
        result.webp = {
          binary: new Uint8Array([1, 2, 3, 4]),
        };
      }

      if (options?.mozjpeg) {
        result.jpeg = {
          binary: new Uint8Array([5, 6, 7, 8]),
        };
      }

      if (options?.oxipng) {
        result.png = {
          binary: new Uint8Array([9, 10, 11, 12]),
        };
      }

      return result;
    }),
  };

  const mockPool = {
    ingestImage: jest.fn().mockResolvedValue(mockImage),
    close: jest.fn().mockResolvedValue(undefined),
  };

  return {
    ImagePool: jest.fn(() => mockPool),
  };
}, { virtual: true });

describe('wasmImageProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processImageWithWASM', () => {
    it('should process image with default options using native WebP', async () => {
      const blob = new Blob(['fake image'], { type: 'image/jpeg' });
      // Mock URL.createObjectURL and URL.revokeObjectURL
      const originalCreateObjectURL = global.URL.createObjectURL;
      const originalRevokeObjectURL = global.URL.revokeObjectURL;
      global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/test');
      global.URL.revokeObjectURL = jest.fn();

      try {
        const result = await processImageWithWASM(blob, { format: 'webp' });
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('mimeType', 'image/webp');
        expect(result).toHaveProperty('size');
      } finally {
        global.URL.createObjectURL = originalCreateObjectURL;
        global.URL.revokeObjectURL = originalRevokeObjectURL;
      }
    });

    it('should process image with custom quality', async () => {
      const blob = new Blob(['fake image'], { type: 'image/jpeg' });
      const options: ProcessOptions = {
        format: 'webp',
        quality: 90,
      };

      const originalCreateObjectURL = global.URL.createObjectURL;
      const originalRevokeObjectURL = global.URL.revokeObjectURL;
      global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/test');
      global.URL.revokeObjectURL = jest.fn();

      try {
        const result = await processImageWithWASM(blob, options);
        expect(result.mimeType).toBe('image/webp');
      } finally {
        global.URL.createObjectURL = originalCreateObjectURL;
        global.URL.revokeObjectURL = originalRevokeObjectURL;
      }
    });

    it('should handle resize options', async () => {
      const blob = new Blob(['fake image'], { type: 'image/jpeg' });
      const options: ProcessOptions = {
        format: 'webp',
        resize: {
          width: 500,
          height: 400,
        },
      };

      const originalCreateObjectURL = global.URL.createObjectURL;
      const originalRevokeObjectURL = global.URL.revokeObjectURL;
      global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/test');
      global.URL.revokeObjectURL = jest.fn();

      try {
        const result = await processImageWithWASM(blob, options);
        expect(result).toHaveProperty('data');
      } finally {
        global.URL.createObjectURL = originalCreateObjectURL;
        global.URL.revokeObjectURL = originalRevokeObjectURL;
      }
    });

    it('should handle non-WebP formats (requires @squoosh/lib)', async () => {
      // For non-WebP formats, it will try to use @squoosh/lib
      // This test verifies the function structure
      const blob = new Blob(['fake image'], { type: 'image/jpeg' });
      const options: ProcessOptions = {
        format: 'jpeg',
        quality: 85,
      };

      // This will attempt to use @squoosh/lib which is mocked
      // The actual implementation may need adjustment based on library behavior
      const result = await processImageWithWASM(blob, options);
      expect(result).toHaveProperty('mimeType');
    });
  });

  describe('processImageToDataURL', () => {
    it('should convert image to data URL', async () => {
      const blob = new Blob(['fake image'], { type: 'image/jpeg' });
      const originalCreateObjectURL = global.URL.createObjectURL;
      const originalRevokeObjectURL = global.URL.revokeObjectURL;
      global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/test');
      global.URL.revokeObjectURL = jest.fn();

      try {
        const result = await processImageToDataURL(blob);
        expect(result).toContain('data:image/webp;base64,');
      } finally {
        global.URL.createObjectURL = originalCreateObjectURL;
        global.URL.revokeObjectURL = originalRevokeObjectURL;
      }
    });

    it('should handle custom options', async () => {
      const blob = new Blob(['fake image'], { type: 'image/jpeg' });
      const options: ProcessOptions = {
        format: 'webp',
        quality: 90,
      };

      const originalCreateObjectURL = global.URL.createObjectURL;
      const originalRevokeObjectURL = global.URL.revokeObjectURL;
      global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/test');
      global.URL.revokeObjectURL = jest.fn();

      try {
        const result = await processImageToDataURL(blob, options);
        expect(result).toContain('data:image/webp;base64,');
      } finally {
        global.URL.createObjectURL = originalCreateObjectURL;
        global.URL.revokeObjectURL = originalRevokeObjectURL;
      }
    });
  });

});
