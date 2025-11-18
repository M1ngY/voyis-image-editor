const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Set up
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;
const uploadPath = path.join(__dirname, 'uploads', 'images');
const thumbnailPath = path.join(__dirname, 'uploads', 'thumbnails');

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

    const image = await prisma.image.create({
      data: {
        filename,
        filepath,
        mimetype,
        size
      }
    });

    res.json({ success: true, image, thumbnail: thumbFilename });
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

    // Save to database
    const image = await prisma.image.create({
      data: {
        filename,
        filepath,
        mimetype: `image/${format}`,
        size: stats.size
      }
    });

    res.json({ 
      success: true, 
      image, 
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

    // Delete files
    const imagePath = image.filepath;
    const thumbFilename = `thumb-${image.filename}`;
    const thumbPath = path.join(thumbnailPath, thumbFilename);

    // Delete original image
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    // Delete thumbnail
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
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

app.get("/images", async (req, res) => {
  const images = await prisma.image.findMany({
    orderBy: { createdAt: "desc" }
  });

  res.json(
    images.map((img) => ({
      id: img.id,
      filename: img.filename,
      createdAt: img.createdAt,
      size: img.size,
      thumbnail: `/thumbnails/thumb-${img.filename}`
    }))
  );
});

app.use("/thumbnails", express.static(path.join(__dirname, "uploads", "thumbnails")));
app.use("/uploads/images", express.static(path.join(__dirname, "uploads", "images")));

app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
