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
}

export default function Viewer({ imageUrl, onClose }: ViewerProps) {
  const [image] = useImage(imageUrl, "anonymous");
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const stageRef = useRef<any>(null);
  const imageRef = useRef<any>(null);

  // Crop box state
  const [crop, setCrop] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const cropRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  // Initialize crop box when image loads
  useEffect(() => {
    if (image) {
      // Wait for next tick to ensure imageRef is set
      setTimeout(() => {
        if (imageRef.current) {
          const img = imageRef.current;
          const imgWidth = img.width();
          const imgHeight = img.height();
          const centerX = (window.innerWidth - imgWidth) / 2;
          const centerY = (window.innerHeight - imgHeight) / 2;
          
          // Set initial crop box to center, 50% of image size
          setCrop({
            x: centerX + imgWidth * 0.25,
            y: centerY + imgHeight * 0.25,
            width: imgWidth * 0.5,
            height: imgHeight * 0.5,
          });
        }
      }, 0);
    }
  }, [image]);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const newScale = Math.max(0.1, Math.min(5, e.evt.deltaY > 0 ? scale / scaleBy : scale * scaleBy));
    setScale(newScale);
  };

  const handleStageDragEnd = (e: any) => {
    const stage = e.target.getStage();
    setStagePos({
      x: stage.x(),
      y: stage.y(),
    });
  };

  const attachTransformer = () => {
    if (trRef.current && cropRef.current) {
      trRef.current.nodes([cropRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  };

  const constrainCropToImage = (x: number, y: number, width: number, height: number) => {
    if (!imageRef.current) return { x, y, width, height };
    
    const img = imageRef.current;
    const imgX = img.x();
    const imgY = img.y();
    const imgWidth = img.width();
    const imgHeight = img.height();

    // Constrain crop box to image bounds
    const minX = imgX;
    const maxX = imgX + imgWidth;
    const minY = imgY;
    const maxY = imgY + imgHeight;

    const constrainedX = Math.max(minX, Math.min(maxX - width, x));
    const constrainedY = Math.max(minY, Math.min(maxY - height, y));
    const constrainedWidth = Math.min(width, maxX - constrainedX);
    const constrainedHeight = Math.min(height, maxY - constrainedY);

    return {
      x: constrainedX,
      y: constrainedY,
      width: Math.max(10, constrainedWidth),
      height: Math.max(10, constrainedHeight),
    };
  };

  const resetCrop = () => {
    if (image && imageRef.current) {
      const img = imageRef.current;
      const imgWidth = img.width();
      const imgHeight = img.height();
      const centerX = (window.innerWidth - imgWidth) / 2;
      const centerY = (window.innerHeight - imgHeight) / 2;
      
      setCrop({
        x: centerX + imgWidth * 0.25,
        y: centerY + imgHeight * 0.25,
        width: imgWidth * 0.5,
        height: imgHeight * 0.5,
      });
      setScale(1);
      if (stageRef.current) {
        stageRef.current.x(0);
        stageRef.current.y(0);
        setStagePos({ x: 0, y: 0 });
      }
    }
  };

  /** Export crop area with correct coordinate calculation */
  const exportCrop = () => {
    if (!image || !imageRef.current || !cropRef.current) return;

    const img = imageRef.current;
    const imgX = img.x();
    const imgY = img.y();
    const imgWidth = img.width();
    const imgHeight = img.height();

    // Calculate crop coordinates relative to image (not stage)
    const cropX = (crop.x - imgX) / scale;
    const cropY = (crop.y - imgY) / scale;
    const cropWidth = crop.width / scale;
    const cropHeight = crop.height / scale;

    // Ensure crop is within image bounds
    const sourceX = Math.max(0, Math.min(imgWidth, cropX));
    const sourceY = Math.max(0, Math.min(imgHeight, cropY));
    const sourceWidth = Math.max(1, Math.min(imgWidth - sourceX, cropWidth));
    const sourceHeight = Math.max(1, Math.min(imgHeight - sourceY, cropHeight));

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = sourceWidth;
    cropCanvas.height = sourceHeight;
    const ctx = cropCanvas.getContext("2d")!;

    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    const dataURL = cropCanvas.toDataURL("image/png");

    // Save as file
    const link = document.createElement("a");
    link.download = `cropped-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  };

  const cropInfo = image ? {
    width: Math.round(crop.width / scale),
    height: Math.round(crop.height / scale),
  } : null;

  return (
    <div style={styles.overlay}>
      {/* UI Toolbar */}
      <div style={styles.toolbar}>
        <button 
          onClick={exportCrop} 
          style={{
            ...styles.btn,
            ...((!image || crop.width === 0) ? { opacity: 0.5, cursor: "not-allowed" } : {})
          }} 
          disabled={!image || crop.width === 0}
        >
          💾 Export Crop
        </button>
        <button 
          onClick={resetCrop} 
          style={{
            ...styles.btn,
            ...(!image ? { opacity: 0.5, cursor: "not-allowed" } : {})
          }} 
          disabled={!image}
        >
          🔄 Reset
        </button>
        {cropInfo && (
          <div style={styles.info}>
            Size: {cropInfo.width} × {cropInfo.height}px
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={styles.btn}>
          ✕ Close
        </button>
      </div>

      <div style={styles.stageContainer}>
        <Stage
          ref={stageRef}
          width={window.innerWidth}
          height={window.innerHeight}
          draggable
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          onWheel={handleWheel}
          onDragEnd={handleStageDragEnd}
          style={{ background: "#111" }}
        >
          <Layer>
            {image && (
              <KonvaImage
                ref={imageRef}
                image={image}
                x={(window.innerWidth - image.width) / 2}
                y={(window.innerHeight - image.height) / 2}
              />
            )}

            {/* Crop rect */}
            {crop.width > 0 && crop.height > 0 && (
              <>
                <Rect
                  ref={cropRef}
                  x={crop.x}
                  y={crop.y}
                  width={crop.width}
                  height={crop.height}
                  stroke="#00ff00"
                  strokeWidth={2}
                  fill="rgba(0, 255, 0, 0.1)"
                  draggable
                  onClick={attachTransformer}
                  onTap={attachTransformer}
                  onDragEnd={(e) => {
                    const constrained = constrainCropToImage(
                      e.target.x(),
                      e.target.y(),
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
                    // Constrain transformer to image bounds
                    if (!imageRef.current) return newBox;
                    
                    const img = imageRef.current;
                    const imgX = img.x();
                    const imgY = img.y();
                    const imgWidth = img.width();
                    const imgHeight = img.height();

                    const minX = imgX;
                    const maxX = imgX + imgWidth;
                    const minY = imgY;
                    const maxY = imgY + imgHeight;

                    return {
                      ...newBox,
                      x: Math.max(minX, Math.min(maxX - newBox.width, newBox.x)),
                      y: Math.max(minY, Math.min(maxY - newBox.height, newBox.y)),
                      width: Math.min(newBox.width, maxX - newBox.x),
                      height: Math.min(newBox.height, maxY - newBox.y),
                    };
                  }}
                  onTransformEnd={() => {
                    const node = cropRef.current;
                    if (!node) return;
                    
                    const constrained = constrainCropToImage(
                      node.x(),
                      node.y(),
                      node.width() * node.scaleX(),
                      node.height() * node.scaleY()
                    );
                    
                    setCrop(constrained);
                    
                    // Reset transform and update position
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

/** UI styles */
const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.85)",
    zIndex: 9999,
    pointerEvents: "auto",
  },
  toolbar: {
    position: "absolute",
    top: 15,
    left: 15,
    right: 15,
    zIndex: 10000,
    display: "flex",
    gap: "10px",
    alignItems: "center",
    background: "rgba(0, 0, 0, 0.7)",
    padding: "10px 15px",
    borderRadius: "8px",
    backdropFilter: "blur(10px)",
  },
  btn: {
    padding: "8px 16px",
    fontSize: "14px",
    border: "none",
    cursor: "pointer",
    background: "#fff",
    borderRadius: "6px",
    fontWeight: 500,
    transition: "all 0.2s",
  },
  info: {
    color: "#fff",
    fontSize: "14px",
    padding: "8px 12px",
    background: "rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    fontFamily: "monospace",
  },
  stageContainer: {
    position: "absolute",
    inset: 0,
  },
};
