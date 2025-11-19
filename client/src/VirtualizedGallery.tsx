import { memo, CSSProperties } from "react";
import { FixedSizeGrid as Grid } from "react-window";
import { ImageItem } from "./Gallery";

interface VirtualizedGalleryProps {
  images: ImageItem[];
  selectedIds: Set<number>;
  deletingId: number | null;
  onToggleSelection: (id: number) => void;
  onDoubleClick: (img: ImageItem) => void;
  onDelete: (id: number, filename: string) => void;
  formatBytes: (size: number | undefined) => string;
  containerWidth: number;
  containerHeight: number;
}

interface CellProps {
  columnIndex: number;
  rowIndex: number;
  style: CSSProperties;
  data: {
    images: ImageItem[];
    selectedIds: Set<number>;
    deletingId: number | null;
    onToggleSelection: (id: number) => void;
    onDoubleClick: (img: ImageItem) => void;
    onDelete: (id: number, filename: string) => void;
    formatBytes: (size: number | undefined) => string;
    columnCount: number;
  };
}

const Cell = memo(({ columnIndex, rowIndex, style, data }: CellProps) => {
  const {
    images,
    selectedIds,
    deletingId,
    onToggleSelection,
    onDoubleClick,
    onDelete,
    formatBytes,
    columnCount,
  } = data;

  const index = rowIndex * columnCount + columnIndex;
  const img = images[index];

  if (!img) {
    return <div style={style} />;
  }

  const isSelected = selectedIds.has(img.id);

  return (
    <div
      style={{
        ...style,
        padding: "8px",
      }}
    >
      <div
        style={{
          border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          position: "relative",
          cursor: "pointer",
          background: "#fff",
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
          boxShadow: isSelected
            ? "0 0 0 3px rgba(37,99,235,0.12)"
            : "0 20px 35px rgba(15,23,42,0.08)",
          height: "100%",
          boxSizing: "border-box",
        }}
        onDoubleClick={() => onDoubleClick(img)}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(event) => {
            event.stopPropagation();
            onToggleSelection(img.id);
          }}
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            width: 18,
            height: 18,
            cursor: "pointer",
            accentColor: "#2563eb",
            zIndex: 2,
          }}
        />
        <img
          src={`http://localhost:4000${img.thumbnail}`}
          style={{
            width: "100%",
            borderRadius: 8,
            pointerEvents: "none",
            aspectRatio: "1",
            objectFit: "cover",
          }}
          alt={img.filename}
          draggable={false}
          loading="lazy"
        />
        <div style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>
          {img.filename}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#64748b",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span>
            {formatBytes(img.size)} • {new Date(img.createdAt).toLocaleDateString()}
          </span>
          <span>Type: {img.mimetype}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(img.id, img.filename);
          }}
          disabled={deletingId === img.id}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "4px 8px",
            fontSize: 12,
            border: "none",
            borderRadius: 6,
            background: deletingId === img.id ? "#94a3b8" : "rgba(220,53,69,0.9)",
            color: "#fff",
            cursor: deletingId === img.id ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {deletingId === img.id ? "..." : "✕"}
        </button>
      </div>
    </div>
  );
});

Cell.displayName = "Cell";

export default function VirtualizedGallery({
  images,
  selectedIds,
  deletingId,
  onToggleSelection,
  onDoubleClick,
  onDelete,
  formatBytes,
  containerWidth,
  containerHeight,
}: VirtualizedGalleryProps) {
  // Calculate grid dimensions
  const columnWidth = 240; // Card width + gap
  const rowHeight = 320; // Estimated card height
  const gap = 16;
  const columnCount = Math.max(1, Math.floor((containerWidth - gap) / columnWidth));
  const rowCount = Math.ceil(images.length / columnCount);

  const cellData = {
    images,
    selectedIds,
    deletingId,
    onToggleSelection,
    onDoubleClick,
    onDelete,
    formatBytes,
    columnCount,
  };

  if (images.length === 0) {
    return null;
  }

  // Ensure minimum height
  const gridHeight = Math.max(400, containerHeight || 600);

  return (
    <Grid
      columnCount={columnCount}
      columnWidth={columnWidth}
      height={gridHeight}
      rowCount={rowCount}
      rowHeight={rowHeight}
      width={Math.max(columnWidth, containerWidth || 800)}
      itemData={cellData}
      style={{
        overflowX: "hidden",
      }}
    >
      {Cell}
    </Grid>
  );
}

