import { useRef, useState, useEffect, CSSProperties } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Rect,
  Transformer,
} from "react-konva";
import useImage from "use-image";

interface ViewerProps {
  imageUrl: string;
  onClose: () => void;
  onUploadSuccess?: () => void;
  mode?: "modal" | "embedded";
  containerSize?: { width: number; height: number };
}

export default function Viewer({
  imageUrl,
  onClose,
  onUploadSuccess,
  mode = "modal",
  containerSize,
}: ViewerProps) {
  const [image] = useImage(imageUrl, "anonymous");

  const isEmbedded = mode === "embedded";
  const stageWidth = isEmbedded && containerSize ? containerSize.width : window.innerWidth;
  const stageHeight = isEmbedded && containerSize ? containerSize.height : window.innerHeight;

  // scale now only applies to the image (not stage)
  const [scale, setScale] = useState(1);
  const [isUploading, setIsUploading] = useState(false);

  const stageRef = useRef<any>(null);
  const imageRef = useRef<any>(null);
  const cropRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  const [crop, setCrop] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  /** Auto-scale image to fit container & initialize crop */
  useEffect(() => {
    if (!image) return;

    const fit = Math.min(stageWidth / image.width, stageHeight / image.height);
    const displayW = image.width * fit;
    const displayH = image.height * fit;
    const imgX = (stageWidth - displayW) / 2;
    const imgY = (stageHeight - displayH) / 2;

    setScale(fit);
    setCrop({
      x: imgX + displayW * 0.25,
      y: imgY + displayH * 0.25,
      width: displayW * 0.5,
      height: displayH * 0.5,
    });
  }, [image, stageWidth, stageHeight]);

  /** Zoom the image only */
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;

    const newScale =
      e.evt.deltaY > 0 ? scale / scaleBy : scale * scaleBy;

    setScale(Math.max(0.1, Math.min(5, newScale)));
  };

  const attachTransformer = () => {
    if (trRef.current && cropRef.current) {
      trRef.current.nodes([cropRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  };

  /** Constrain crop inside image */
  const constrainCropToImage = (x: number, y: number, width: number, height: number) => {
    if (!imageRef.current) return { x, y, width, height };

    const img = imageRef.current;
    const imgX = img.x();
    const imgY = img.y();
    const imgW = img.width();
    const imgH = img.height();

    const newX = Math.max(imgX, Math.min(imgX + imgW - width, x));
    const newY = Math.max(imgY, Math.min(imgY + imgH - height, y));

    return {
      x: newX,
      y: newY,
      width: Math.max(10, width),
      height: Math.max(10, height),
    };
  };

  const resetCrop = () => {
    if (!image) return;
    const fit = Math.min(stageWidth / image.width, stageHeight / image.height);
    const displayW = image.width * fit;
    const displayH = image.height * fit;
    const imgX = (stageWidth - displayW) / 2;
    const imgY = (stageHeight - displayH) / 2;

    setScale(fit);
    setCrop({
      x: imgX + displayW * 0.25,
      y: imgY + displayH * 0.25,
      width: displayW * 0.5,
      height: displayH * 0.5,
    });
  };

  /** Export crop */
  const getCroppedImageData = () => {
    if (!image || !imageRef.current || !cropRef.current) return null;

    const img = imageRef.current;

    const dx = (crop.x - img.x()) / scale;
    const dy = (crop.y - img.y()) / scale;
    const dw = crop.width / scale;
    const dh = crop.height / scale;

    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d")!;

    ctx.drawImage(image, dx, dy, dw, dh, 0, 0, dw, dh);

    return canvas.toDataURL();
  };

  const exportCrop = () => {
    const data = getCroppedImageData();
    if (!data) return;
    const link = document.createElement("a");
    link.download = `crop-${Date.now()}.png`;
    link.href = data;
    link.click();
  };

  /** Upload crop */
  const uploadCrop = async () => {
    const data = getCroppedImageData();
    if (!data) {
      alert("No crop available");
      return;
    }

    const fileName = imageUrl.split("/").pop() ?? "image.png";

    setIsUploading(true);
    try {
      const res = await fetch("http://localhost:4000/upload/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData: data,
          originalFilename: fileName,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `Server error (${res.status})`;
        try {
          const parsed = JSON.parse(text);
          message = parsed.error || message;
          if (parsed.details) message += `: ${parsed.details}`;
        } catch {
          if (text) message = text;
        }
        throw new Error(message);
      }

      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || "Upload failed");
      }

      alert("Cropped image uploaded successfully!");
      onUploadSuccess?.();
    } catch (err: any) {
      alert(`Failed to upload cropped image: ${err?.message || err}`);
    } finally {
      setIsUploading(false);
    }
  };

  const cropInfo = image
    ? {
        width: Math.round(crop.width / scale),
        height: Math.round(crop.height / scale),
      }
    : null;

  return (
    <div style={isEmbedded ? styles.embedWrapper : styles.overlay}>
      {/* Toolbar */}
      <div style={isEmbedded ? styles.embedToolbar : styles.toolbar}>
        <button
          onClick={uploadCrop}
          style={{
            ...styles.btn,
            opacity: isUploading ? 0.6 : 1,
            cursor: isUploading ? "not-allowed" : "pointer",
          }}
          disabled={isUploading}
        >
          {isUploading ? "⏳ Uploading..." : "☁️ Upload"}
        </button>
        <button onClick={exportCrop} style={styles.btn}>💾 Export</button>
        <button onClick={resetCrop} style={styles.btn}>🔄 Reset</button>
        {cropInfo && (
          <div style={styles.info}>
            Size: {cropInfo.width} × {cropInfo.height}px
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={styles.btn}>✕ Close</button>
      </div>

      {/* Stage */}
      <div style={styles.stageContainer}>
        <Stage
          ref={stageRef}
          width={stageWidth}
          height={stageHeight}
          draggable
          onWheel={handleWheel}
          style={{ background: "#111" }}
        >
          <Layer>
            {image && (
              <KonvaImage
                ref={imageRef}
                image={image}
                width={image.width * scale}
                height={image.height * scale}
                x={(stageWidth - image.width * scale) / 2}
                y={(stageHeight - image.height * scale) / 2}
              />
            )}

            {/* Crop box */}
            {crop.width > 0 && (
              <>
                <Rect
                  ref={cropRef}
                  {...crop}
                  stroke="lime"
                  strokeWidth={2}
                  fill="rgba(0,255,0,0.1)"
                  draggable
                  onClick={attachTransformer}
                  onDragEnd={(e) => {
                    const { x, y } = e.target.position();
                    const constrained = constrainCropToImage(
                      x,
                      y,
                      crop.width,
                      crop.height
                    );
                    setCrop(constrained);
                    e.target.position({ x: constrained.x, y: constrained.y });
                  }}
                />
                <Transformer
                  ref={trRef}
                  rotateEnabled={false}
                  keepRatio={false}
                  boundBoxFunc={(_oldBox, newBox) => {
                    const constrained = constrainCropToImage(
                      newBox.x,
                      newBox.y,
                      newBox.width,
                      newBox.height
                    );
                    return {
                      ...newBox,
                      x: constrained.x,
                      y: constrained.y,
                      width: constrained.width,
                      height: constrained.height,
                    };
                  }}
                  onTransformEnd={() => {
                    const node = cropRef.current;
                    const width = node.width() * node.scaleX();
                    const height = node.height() * node.scaleY();

                    const constrained = constrainCropToImage(
                      node.x(),
                      node.y(),
                      width,
                      height
                    );

                    setCrop(constrained);

                    node.scaleX(1);
                    node.scaleY(1);
                    node.position({ x: constrained.x, y: constrained.y });
                    node.width(constrained.width);
                    node.height(constrained.height);
                  }}
                />
              </>
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

/** Styles */
const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.85)",
    zIndex: 9999,
  },
  embedWrapper: {
    position: "relative",
    width: "100%",
    height: "100%",
    background: "#0f172a",
    borderRadius: 16,
    overflow: "hidden",
  },
  toolbar: {
    position: "absolute",
    top: 15,
    left: 15,
    right: 15,
    zIndex: 10000,
    display: "flex",
    gap: 10,
    padding: "10px 15px",
    background: "rgba(0,0,0,0.6)",
    borderRadius: 8,
  },
  embedToolbar: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    zIndex: 10,
    display: "flex",
    gap: 8,
    padding: "8px 12px",
    background: "rgba(15,23,42,0.85)",
    borderRadius: 10,
  },
  btn: {
    padding: "8px 16px",
    background: "#fff",
    borderRadius: 6,
    cursor: "pointer",
    border: "none",
  },
  info: {
    color: "#fff",
    padding: "5px 10px",
    background: "rgba(255,255,255,0.1)",
    borderRadius: 6,
  },
  stageContainer: {
    position: "absolute",
    inset: 0,
  },
};
