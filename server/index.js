const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const archiver = require('archiver');
const exifr = require('exifr');

// Set up
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;
const uploadPath = path.join(__dirname, 'uploads', 'images');
const thumbnailPath = path.join(__dirname, 'uploads', 'thumbnails');
const fsPromises = fs.promises;

// Ensure upload directory exists
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

if (!fs.existsSync(thumbnailPath)) {
  fs.mkdirSync(thumbnailPath, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

const allowedEditableExifKeys = [
  'make',
  'model',
  'lensModel',
  'iso',
  'exposureTime',
  'fNumber',
  'focalLength',
  'dateTimeOriginal',
  'gpsLatitude',
  'gpsLongitude',
];

const normalizeString = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length === 0 ? null : str;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toNullableDateISOString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const sanitizeEditableExif = (input) => {
  if (input === null) return null;
  if (typeof input !== 'object') return null;

  const sanitized = {};
  let hasValue = false;

  allowedEditableExifKeys.forEach((key) => {
    if (!(key in input)) {
      return;
    }
    let value = input[key];
    switch (key) {
      case 'iso':
      case 'fNumber':
        value = toNullableNumber(value);
        break;
      case 'gpsLatitude':
      case 'gpsLongitude':
        value = toNullableNumber(value);
        break;
      case 'dateTimeOriginal':
        value = toNullableDateISOString(value);
        break;
      default:
        value = normalizeString(value);
        break;
    }
    sanitized[key] = value;
    if (value !== null && value !== undefined) {
      hasValue = true;
    }
  });

  return hasValue ? sanitized : null;
};

const extractExifMetadata = async (source) => {
  try {
    const raw = await exifr.parse(source, {
      reviveValues: true,
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
    });
    if (!raw) return null;

    return sanitizeEditableExif({
      make: raw.Make || raw.make,
      model: raw.Model || raw.model,
      lensModel: raw.LensModel || raw.lensModel,
      iso: raw.ISO || raw.iso || raw.ISOSpeedRatings,
      exposureTime: raw.ExposureTime || raw.exposureTime,
      fNumber: raw.FNumber || raw.fNumber || raw.ApertureValue,
      focalLength: raw.FocalLength || raw.focalLength,
      dateTimeOriginal:
        raw.DateTimeOriginal ||
        raw.DateTime ||
        raw.CreateDate ||
        raw.ModifyDate,
      gpsLatitude: raw.latitude || raw.GPSLatitude || raw.lat,
      gpsLongitude: raw.longitude || raw.GPSLongitude || raw.lon,
    });
  } catch (error) {
    console.warn('Failed to extract EXIF:', error.message);
    return null;
  }
};

const buildImageResponse = (img) => ({
  id: img.id,
  filename: img.filename,
  mimetype: img.mimetype,
  size: img.size,
  createdAt: img.createdAt,
  updatedAt: img.updatedAt,
  thumbnail: `/thumbnails/thumb-${img.filename}`,
  original: `/uploads/images/${img.filename}`,
  exif: img.exif || null,
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Check health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Upload file (multipart/form-data)
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { filename, path: filepath, mimetype, size } = req.file;

    const thumbFilename = `thumb-${filename}`;
    const thumbFullPath = path.join(thumbnailPath, thumbFilename);
    await sharp(filepath).resize(300).toFile(thumbFullPath);

    const exif = await extractExifMetadata(filepath);

    const image = await prisma.image.create({
      data: {
        filename,
        filepath,
        mimetype,
        size,
        exif,
      }
    });

    res.json({ success: true, image: buildImageResponse(image), thumbnail: thumbFilename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload cropped image from base64
app.post('/upload/crop', async (req, res) => {
  try {
    const { imageData, originalFilename } = req.body;
    
    if (!imageData || !imageData.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    // Parse base64 data
    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid base64 format' });
    }

    const [, format, base64Data] = matches;
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Generate filename
    const timestamp = Date.now();
    const ext = format === 'png' ? 'png' : 'jpg';
    const filename = `cropped-${timestamp}-${originalFilename || 'image'}.${ext}`;
    const filepath = path.join(uploadPath, filename);

    // Save image
    await sharp(buffer).toFile(filepath);
    const stats = fs.statSync(filepath);

    // Generate thumbnail
    const thumbFilename = `thumb-${filename}`;
    const thumbFullPath = path.join(thumbnailPath, thumbFilename);
    await sharp(buffer).resize(300).toFile(thumbFullPath);

    const exif = await extractExifMetadata(filepath);

    // Save to database
    const image = await prisma.image.create({
      data: {
        filename,
        filepath,
        mimetype: `image/${format}`,
        size: stats.size,
        exif,
      }
    });

    res.json({ 
      success: true, 
      image: buildImageResponse(image), 
      thumbnail: thumbFilename,
      message: 'Cropped image uploaded successfully'
    });
  } catch (err) {
    console.error('Crop upload error:', err);
    const errorMessage = err.message || 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to upload cropped image',
      details: errorMessage 
    });
  }
});

// Delete image (must be before /images route to avoid conflicts)
app.delete("/images/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid image ID' });
    }

    // Find image in database
    const image = await prisma.image.findUnique({
      where: { id }
    });

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete files with retry mechanism for Windows EBUSY errors
    const imagePath = image.filepath;
    const thumbFilename = `thumb-${image.filename}`;
    const thumbPath = path.join(thumbnailPath, thumbFilename);

    // Helper function to delete file with retry
    const deleteFileWithRetry = (filePath, maxRetries = 3, delay = 300) => {
      return new Promise((resolve, reject) => {
        const attemptDelete = (retries) => {
          if (!fs.existsSync(filePath)) {
            resolve();
            return;
          }

          fs.unlink(filePath, (err) => {
            if (!err) {
              resolve();
            } else if (err.code === 'EBUSY' && retries > 0) {
              // Windows file lock - retry after delay
              setTimeout(() => attemptDelete(retries - 1), delay);
            } else {
              reject(err);
            }
          });
        };
        attemptDelete(maxRetries);
      });
    };

    // Delete original image with retry
    try {
      await deleteFileWithRetry(imagePath);
    } catch (err) {
      console.warn(`Failed to delete image file ${imagePath}:`, err.message);
      // Continue even if file deletion fails
    }

    // Delete thumbnail with retry
    try {
      await deleteFileWithRetry(thumbPath);
    } catch (err) {
      console.warn(`Failed to delete thumbnail ${thumbPath}:`, err.message);
      // Continue even if thumbnail deletion fails
    }

    // Delete from database
    await prisma.image.delete({
      where: { id }
    });

    res.json({ 
      success: true, 
      message: 'Image deleted successfully' 
    });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ 
      error: 'Failed to delete image',
      details: err.message 
    });
  }
});

// Update image metadata (rename + EXIF editing)
app.put("/images/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid image ID' });
    }

    const { filename, exif } = req.body || {};
    if (typeof filename === 'undefined' && typeof exif === 'undefined') {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const image = await prisma.image.findUnique({ where: { id } });
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const updates = {};
    let renamed = false;

    if (typeof exif !== 'undefined') {
      if (exif !== null && typeof exif !== 'object') {
        return res.status(400).json({ error: 'exif must be an object or null' });
      }
      updates.exif = sanitizeEditableExif(exif);
    }

    if (typeof filename !== 'undefined') {
      if (typeof filename !== 'string') {
        return res.status(400).json({ error: 'filename must be a string' });
      }
      const sanitized = path.basename(filename.trim());
      if (!sanitized) {
        return res.status(400).json({ error: 'filename cannot be empty' });
      }
      if (sanitized.includes('/') || sanitized.includes('\\')) {
        return res.status(400).json({ error: 'filename cannot contain path separators' });
      }
      if (sanitized !== image.filename) {
        const newFilePath = path.join(uploadPath, sanitized);
        if (fs.existsSync(newFilePath)) {
          return res.status(409).json({ error: 'A file with the requested name already exists' });
        }

        try {
          await fsPromises.rename(image.filepath, newFilePath);
        } catch (err) {
          console.error('Failed to rename image file:', err);
          return res.status(500).json({ error: 'Failed to rename image file', details: err.message });
        }

        const oldThumbPath = path.join(thumbnailPath, `thumb-${image.filename}`);
        const newThumbPath = path.join(thumbnailPath, `thumb-${sanitized}`);
        if (fs.existsSync(oldThumbPath)) {
          try {
            await fsPromises.rename(oldThumbPath, newThumbPath);
          } catch (err) {
            console.warn(`Failed to rename thumbnail ${oldThumbPath}:`, err.message);
          }
        }

        updates.filename = sanitized;
        updates.filepath = newFilePath;
        renamed = true;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.json({
        success: true,
        message: 'No changes applied',
        image: buildImageResponse(image),
      });
    }

    const updatedImage = await prisma.image.update({
      where: { id },
      data: updates,
    });

    const messageParts = [];
    if (renamed) messageParts.push('Filename updated');
    if (Object.prototype.hasOwnProperty.call(updates, 'exif')) {
      messageParts.push(updates.exif ? 'EXIF metadata updated' : 'EXIF metadata cleared');
    }

    res.json({
      success: true,
      image: buildImageResponse(updatedImage),
      message: messageParts.join(' • ') || 'Image updated successfully',
    });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Failed to update image', details: err.message });
  }
});

app.get("/images", async (req, res) => {
  try {
    const images = await prisma.image.findMany({
      orderBy: { createdAt: "desc" }
    });

    res.json(images.map(buildImageResponse));
  } catch (err) {
    console.error('Failed to list images:', err);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

app.get("/images/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid image ID' });
    }

    const image = await prisma.image.findUnique({ where: { id } });
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json(buildImageResponse(image));
  } catch (err) {
    console.error('Failed to fetch image:', err);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

app.post("/sync", async (req, res) => {
  try {
    const { localImages } = req.body || {};
    if (!Array.isArray(localImages)) {
      return res.status(400).json({ error: 'localImages must be an array' });
    }

    const serverImages = await prisma.image.findMany();
    const localMap = new Map(
      localImages
        .filter((img) => typeof img?.id === 'number')
        .map((img) => [img.id, img])
    );

    const addedOrUpdated = [];
    const conflicts = [];

    for (const img of serverImages) {
      const local = localMap.get(img.id);
      const serverUpdatedAt = new Date(img.updatedAt).getTime();
      if (!local) {
        addedOrUpdated.push(buildImageResponse(img));
        continue;
      }

      const localLastModified = Number(local.lastModified) || 0;
      const localStatus = local.syncStatus || 'synced';

      if (localStatus === 'pending') {
        if (serverUpdatedAt > localLastModified) {
          conflicts.push({
            id: img.id,
            server: buildImageResponse(img),
            serverUpdatedAt,
            localLastModified,
          });
        }
        continue;
      }

      if (serverUpdatedAt > localLastModified) {
        addedOrUpdated.push(buildImageResponse(img));
      }
    }

    const serverIds = new Set(serverImages.map((img) => img.id));
    const removed = localImages
      .filter((img) => typeof img?.id === 'number')
      .filter((img) => !serverIds.has(img.id) && img.syncStatus !== 'pending')
      .map((img) => img.id);

    res.json({
      addedOrUpdated,
      removed,
      conflicts,
    });
  } catch (err) {
    console.error('Sync endpoint error:', err);
    res.status(500).json({ error: 'Failed to sync', details: err.message });
  }
});

app.post("/images/export", async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    const parsedIds = [...new Set(ids.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id)))];
    if (parsedIds.length === 0) {
      return res.status(400).json({ error: 'No valid image IDs provided' });
    }

    const images = await prisma.image.findMany({
      where: { id: { in: parsedIds } },
    });

    if (images.length === 0) {
      return res.status(404).json({ error: 'No images found for export' });
    }

    const filename = `voyis-export-${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to build archive', details: err.message });
      } else {
        res.end();
      }
    });

    archive.pipe(res);

    images.forEach((img) => {
      if (!fs.existsSync(img.filepath)) {
        archive.append(`Source file missing: ${img.filename}\n`, {
          name: `missing-${img.filename}.txt`,
        });
        return;
      }
      archive.file(img.filepath, { name: img.filename });
    });

    archive.finalize();
  } catch (err) {
    console.error('Batch export error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export images', details: err.message });
    } else {
      res.end();
    }
  }
});

app.use("/thumbnails", express.static(path.join(__dirname, "uploads", "thumbnails")));
app.use("/uploads/images", express.static(path.join(__dirname, "uploads", "images")));

// Export app for testing
if (require.main !== module) {
  module.exports = app;
} else {
  app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
}
