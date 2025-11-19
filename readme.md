# Voyis Image Editor

## How to run

### 1. Run Postgres DB
```bash
docker compose up -d
```

### 2. Run API Server
```bash
cd server
npm start
```

### 3. Run Electron client
```bash
cd client
npm install
npm run dev
```

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Health check endpoint |
| `GET` | `/images` | List all uploaded image metadata |
| `GET` | `/images/:id` | Fetch a single image’s metadata (thumbnail/original URLs included) |
| `POST` | `/upload` | Upload an image via `multipart/form-data` and generate a thumbnail |
| `POST` | `/upload/crop` | Upload a cropped image represented as base64 data |
| `POST` | `/sync` | Diff server state against client-provided metadata for synchronization |
| `POST` | `/images/export` | Stream a ZIP archive containing the requested image IDs |
| `PUT` | `/images/:id` | Update metadata (currently supports safe file rename + thumbnail sync) |
| `DELETE` | `/images/:id` | Remove the image file, thumbnail, and database record |

> The API server listens on `http://localhost:4000` by default. Start Postgres and `server` before launching the Electron client.

`PUT /images/:id` also accepts an optional `exif` object (e.g. `{ make, model, iso, dateTimeOriginal }`) so the client UI can edit stored camera metadata without rewriting the physical file.

## Features

### WASM Image Processing
The application includes WebAssembly-based image processing capabilities:
- **Browser-compatible**: Uses `@squoosh/lib` - no Node.js native dependencies
- **Optimization**: Compress and optimize images before upload/export
- **Format conversion**: Convert to WebP/JPEG/PNG with quality control
- **Toggleable**: Enable/disable WASM processing in the Single-Image Viewer
- **Auto-fallback**: Automatically falls back to original image if WASM processing fails

To use WASM processing:
1. Open an image in the Single-Image Viewer (double-click a thumbnail)
2. Click the "⚡ WASM OFF" button to enable WASM processing
3. When enabled, exported and uploaded cropped images will be optimized using WebAssembly

## Testing

### Client Tests
```bash
cd client
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Generate coverage report
```

### Server Tests
```bash
cd server
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Generate coverage report
```

### Test Coverage
- **syncUtils**: Complete test coverage for all utility functions
- **Gallery Component**: Basic rendering and interaction tests
- **Viewer Component**: Component rendering and WASM toggle tests
- **WASM Image Processor**: Image processing function tests
- **API Endpoints**: Full endpoint testing with mocked dependencies
- **Coverage threshold**: 50% for branches, functions, lines, and statements

