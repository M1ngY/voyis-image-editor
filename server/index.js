const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

// Set up
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;
const uploadPath = path.join(__dirname, 'uploads', 'images');

// Ensure upload directory exists
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.use(express.json());

// Check health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Upload file
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { filename, path: filepath, mimetype, size } = req.file;

    const image = await prisma.image.create({
      data: {
        filename,
        filepath,
        mimetype,
        size
      }
    });

    res.json({ success: true, image });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
