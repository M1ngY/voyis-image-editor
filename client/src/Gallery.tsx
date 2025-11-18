import { useEffect, useState } from "react";
import Viewer from "./Viewer";  
interface ImageItem {
  id: number;
  filename: string;
  createdAt: string;
  size: number;
  thumbnail: string;
}

export default function Gallery() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:4000/images")
      .then(res => res.json())
      .then(data => {
        console.log("Fetched images:", data);
        setImages(data);
      })
      .catch(err => console.error("Fetch error:", err));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h2>Image Gallery</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 200px)",
          gap: "16px",
        }}
      >
        {images.map(img => (
          <div
            key={img.id}
            style={{
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 8,
              cursor: "pointer"
            }}
            onClick={() => setSelectedImage(`http://localhost:4000/uploads/images/${img.filename}`)}
          >
            <img
              src={`http://localhost:4000${img.thumbnail}`}
              style={{ width: "100%", borderRadius: 4 }}
            />
            <div style={{ fontSize: 12 }}>{img.filename}</div>
          </div>
        ))}
      </div>

      {/* Viewer Modal */}
      {selectedImage && (
        <Viewer
          imageUrl={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </div>
  );
}
