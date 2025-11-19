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
| `PUT` | `/images/:id` | Update metadata (currently supports safe file rename + thumbnail sync) |
| `DELETE` | `/images/:id` | Remove the image file, thumbnail, and database record |

