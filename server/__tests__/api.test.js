const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Mock Prisma Client
const mockPrisma = {
  image: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

// Mock file system
jest.mock('fs', () => {
  const mockStats = { size: 1000, isFile: () => true };
  return {
    existsSync: jest.fn(() => false),
    mkdirSync: jest.fn(),
    statSync: jest.fn(() => mockStats),
    lstatSync: jest.fn(() => mockStats),
    createReadStream: jest.fn(() => ({
      pipe: jest.fn(),
      on: jest.fn(),
    })),
    createWriteStream: jest.fn(() => ({
      on: jest.fn(),
      end: jest.fn(),
      write: jest.fn(),
    })),
    promises: {
      rename: jest.fn().mockResolvedValue(undefined),
      stat: jest.fn().mockResolvedValue(mockStats),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
    unlink: jest.fn((filePath, callback) => {
      if (callback) callback(null);
      return true;
    }),
  };
});

// Mock sharp
jest.mock('sharp', () => {
  const mockSharp = jest.fn(() => ({
    resize: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue({}),
  }));
  return mockSharp;
});

// Mock exifr
jest.mock('exifr', () => ({
  parse: jest.fn().mockResolvedValue(null),
}));

// Mock multer
const mockMulter = {
  diskStorage: jest.fn(),
  single: jest.fn(() => (req, res, next) => {
    req.file = {
      filename: 'test-123.jpg',
      path: '/test/path/test-123.jpg',
      mimetype: 'image/jpeg',
      size: 1000,
    };
    next();
  }),
};

jest.mock('multer', () => {
  const multer = jest.fn(() => mockMulter);
  multer.diskStorage = jest.fn();
  return multer;
});

// Mock archiver to avoid real file system work
jest.mock('archiver', () => {
  return jest.fn(() => {
    let outputStream = null;
    return {
      pipe: jest.fn((stream) => {
        outputStream = stream;
      }),
      file: jest.fn(),
      append: jest.fn(),
      finalize: jest.fn(() => {
        if (outputStream && typeof outputStream.end === 'function') {
          outputStream.end();
        }
        return Promise.resolve();
      }),
      on: jest.fn(),
    };
  });
});

// Import app after mocks
const app = require('../index');

describe('API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /images', () => {
    it('should return list of images', async () => {
      const mockImages = [
        {
          id: 1,
          filename: 'test.jpg',
          filepath: '/test/path/test.jpg',
          mimetype: 'image/jpeg',
          size: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
          exif: null,
        },
      ];

      mockPrisma.image.findMany.mockResolvedValue(mockImages);

      const response = await request(app)
        .get('/images')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(mockPrisma.image.findMany).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockPrisma.image.findMany.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .get('/images')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /images/:id', () => {
    it('should return single image by id', async () => {
      const mockImage = {
        id: 1,
        filename: 'test.jpg',
        filepath: '/test/path/test.jpg',
        mimetype: 'image/jpeg',
        size: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
        exif: null,
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);

      const response = await request(app)
        .get('/images/1')
        .expect(200);

      expect(response.body).toHaveProperty('id', 1);
      expect(response.body).toHaveProperty('filename', 'test.jpg');
    });

    it('should return 404 for non-existent image', async () => {
      mockPrisma.image.findUnique.mockResolvedValue(null);

      await request(app)
        .get('/images/999')
        .expect(404);
    });

    it('should return 400 for invalid id', async () => {
      await request(app)
        .get('/images/invalid')
        .expect(400);
    });
  });

  describe('POST /upload', () => {
    it('should handle image upload', async () => {
      const mockImage = {
        id: 1,
        filename: 'test-123.jpg',
        filepath: '/test/path/test-123.jpg',
        mimetype: 'image/jpeg',
        size: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
        exif: null,
      };

      mockPrisma.image.create.mockResolvedValue(mockImage);

      const response = await request(app)
        .post('/upload')
        .attach('image', Buffer.from('fake image data'), 'test.jpg')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('image');
    });
  });

  describe('POST /sync', () => {
    it('should handle sync request', async () => {
      const mockServerImages = [
        {
          id: 1,
          filename: 'server.jpg',
          filepath: '/test/path/server.jpg',
          mimetype: 'image/jpeg',
          size: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
          exif: null,
        },
      ];

      mockPrisma.image.findMany.mockResolvedValue(mockServerImages);

      const response = await request(app)
        .post('/sync')
        .send({
          localImages: [
            { id: 1, lastModified: Date.now(), syncStatus: 'synced' },
          ],
        })
        .expect(200);

      expect(response.body).toHaveProperty('addedOrUpdated');
      expect(response.body).toHaveProperty('removed');
      expect(response.body).toHaveProperty('conflicts');
    });

    it('should return 400 for invalid request body', async () => {
      await request(app)
        .post('/sync')
        .send({})
        .expect(400);
    });
  });

  describe('PUT /images/:id', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(false);
    fs.promises.rename.mockResolvedValue(undefined);
  });

    it('should update image metadata', async () => {
      const existingImage = {
        id: 1,
        filename: 'old.jpg',
        filepath: '/test/path/old.jpg',
        mimetype: 'image/jpeg',
        size: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
        exif: null,
      };

      const updatedImage = {
        ...existingImage,
        filename: 'new.jpg',
        filepath: '/test/path/new.jpg',
      };

      mockPrisma.image.findUnique.mockResolvedValue(existingImage);
      mockPrisma.image.update.mockResolvedValue(updatedImage);

      const response = await request(app)
        .put('/images/1')
        .send({ filename: 'new.jpg' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.image.filename).toBe('new.jpg');
    });

    it('should update EXIF metadata', async () => {
      const existingImage = {
        id: 1,
        filename: 'test.jpg',
        filepath: '/test/path/test.jpg',
        mimetype: 'image/jpeg',
        size: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
        exif: null,
      };

      const updatedImage = {
        ...existingImage,
        exif: { make: 'Canon', model: 'EOS 5D' },
      };

      mockPrisma.image.findUnique.mockResolvedValue(existingImage);
      mockPrisma.image.update.mockResolvedValue(updatedImage);

      const response = await request(app)
        .put('/images/1')
        .send({
          exif: { make: 'Canon', model: 'EOS 5D' },
        })
        .expect(200);

      expect(response.body.image.exif).toHaveProperty('make', 'Canon');
    });
  });

  describe('DELETE /images/:id', () => {
    it('should delete image', async () => {
      const mockImage = {
        id: 1,
        filename: 'test.jpg',
        filepath: '/test/path/test.jpg',
        mimetype: 'image/jpeg',
        size: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
        exif: null,
      };

      mockPrisma.image.findUnique.mockResolvedValue(mockImage);
      mockPrisma.image.delete.mockResolvedValue(mockImage);

      const response = await request(app)
        .delete('/images/1')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(mockPrisma.image.delete).toHaveBeenCalled();
    });

    it('should return 404 for non-existent image', async () => {
      mockPrisma.image.findUnique.mockResolvedValue(null);

      await request(app)
        .delete('/images/999')
        .expect(404);
    });
  });

  describe('POST /images/export', () => {
    it('should export images as ZIP', async () => {
    fs.existsSync.mockReturnValue(true);

      const mockImages = [
        {
          id: 1,
          filename: 'test1.jpg',
          filepath: '/test/path/test1.jpg',
          mimetype: 'image/jpeg',
          size: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
          exif: null,
        },
        {
          id: 2,
          filename: 'test2.jpg',
          filepath: '/test/path/test2.jpg',
          mimetype: 'image/jpeg',
          size: 2000,
          createdAt: new Date(),
          updatedAt: new Date(),
          exif: null,
        },
      ];

      mockPrisma.image.findMany.mockResolvedValue(mockImages);
      fs.existsSync.mockReturnValue(true);

      const response = await request(app)
        .post('/images/export')
        .send({ ids: [1, 2] })
        .expect(200);

      expect(response.headers['content-type']).toContain('application/zip');
    });

    it('should return 400 for invalid request', async () => {
      await request(app)
        .post('/images/export')
        .send({ ids: [] })
        .expect(400);
    });
  });
});
