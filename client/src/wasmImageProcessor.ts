/**
 * WASM-based Image Processor
 * Uses browser-native WebP encoding for compatibility
 * Falls back to @squoosh/lib if native encoding fails
 */

// Try to use native WebP encoding first, then fallback to @squoosh/lib
let useNativeWebP = true;
let ImagePoolClass: typeof import('@squoosh/lib').ImagePool | null = null;

async function loadSquooshLib() {
  if (!ImagePoolClass) {
    try {
      console.log('Loading @squoosh/lib as fallback...');
      const squooshLib = await import('@squoosh/lib');
      ImagePoolClass = squooshLib.ImagePool;
      console.log('@squoosh/lib loaded successfully');
    } catch (error) {
      console.error('Failed to load @squoosh/lib:', error);
      throw new Error(`WASM image processing library failed to load: ${(error as Error).message}`);
    }
  }
  return { ImagePool: ImagePoolClass };
}

/**
 * Convert image to WebP using native browser API
 */
async function encodeToWebPNative(
  imageData: Blob | File,
  quality: number = 0.9
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageData);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      
      // Use native toBlob with WebP format
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to encode WebP'));
            return;
          }
          
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        'image/webp',
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

export interface ProcessOptions {
  quality?: number;
  resize?: {
    width?: number;
    height?: number;
    method?: 'triangle' | 'catrom' | 'mitchell' | 'lanczos3';
  };
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
}

export interface ProcessResult {
  data: Uint8Array;
  mimeType: string;
  size: number;
}

/**
 * Process image using WASM
 * @param imageData - Image data as ArrayBuffer, Blob, or File
 * @param options - Processing options
 * @returns Processed image data
 */
export async function processImageWithWASM(
  imageData: ArrayBuffer | Blob | File,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  // Try native WebP encoding first if format is webp
  if (options.format === 'webp' && useNativeWebP) {
    try {
      const blob = imageData instanceof ArrayBuffer 
        ? new Blob([imageData])
        : imageData;
      const dataUrl = await encodeToWebPNative(blob, (options.quality ?? 80) / 100);
      const base64Data = dataUrl.split(',')[1];
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      return {
        data: binaryData,
        mimeType: 'image/webp',
        size: binaryData.length,
      };
    } catch (error) {
      console.warn('Native WebP encoding failed, falling back to WASM:', error);
      useNativeWebP = false; // Disable native encoding for future attempts
    }
  }
  
  // Fallback to @squoosh/lib
  const { ImagePool } = await loadSquooshLib();
  const pool = new ImagePool();
  
  try {
    // Convert to ArrayBuffer if needed
    let buffer: ArrayBuffer;
    if (imageData instanceof ArrayBuffer) {
      buffer = imageData;
    } else if (imageData instanceof Blob || imageData instanceof File) {
      buffer = await imageData.arrayBuffer();
    } else {
      throw new Error('Unsupported image data type');
    }

    // Decode image
    const image = await pool.ingestImage(buffer);

    // Prepare encode options
    const encodeOptions: any = {};

    // Set format
    const format = options.format || 'webp';
    
    if (format === 'webp') {
      // Simplified WebP encoding options - more reliable
      encodeOptions.webp = {
        quality: options.quality ?? 80,
      } as any;
    } else if (format === 'jpeg') {
      encodeOptions.mozjpeg = {
        quality: options.quality ?? 80,
        baseline: false,
        arithmetic: false,
        progressive: true,
        optimize_coding: true,
        smoothing: 0,
        color_space: 3,
        quant_table: 3,
        trellis_multipass: false,
        trellis_opt_zero: false,
        trellis_opt_table: false,
        trellis_loops: 1,
        auto_subsample: true,
        chroma_subsample: 2,
        separate_chroma_quality: false,
        chroma_quality: 75,
      };
    } else if (format === 'png') {
      encodeOptions.oxipng = {
        level: 2,
      };
    }

    // Handle resize if specified
    if (options.resize) {
      const { width, height, method = 'lanczos3' } = options.resize;
      
      if (width || height) {
        const { bitmap } = image;
        const currentWidth = bitmap.width;
        const currentHeight = bitmap.height;
        
        let targetWidth = width || currentWidth;
        let targetHeight = height || currentHeight;
        
        // Maintain aspect ratio if only one dimension is specified
        if (width && !height) {
          targetHeight = Math.round((currentHeight * width) / currentWidth);
        } else if (height && !width) {
          targetWidth = Math.round((currentWidth * height) / currentHeight);
        }

        // Resize using WASM
        await image.preprocess({
          resize: {
            enabled: true,
            width: targetWidth,
            height: targetHeight,
            method: method as any,
          },
        });
      }
    }

    // Encode image
    console.log(`Encoding image as ${format} with options:`, encodeOptions);
    const encoded = await image.encode(encodeOptions);
    const result = encoded[format];

    if (!result) {
      console.error(`Failed to encode as ${format}. Available formats:`, Object.keys(encoded));
      throw new Error(`Failed to encode image as ${format}. Available formats: ${Object.keys(encoded).join(', ')}`);
    }
    
    console.log(`Successfully encoded as ${format}. Size: ${result.binary.length} bytes`);

    // Get MIME type
    const mimeTypes: Record<string, string> = {
      webp: 'image/webp',
      jpeg: 'image/jpeg',
      png: 'image/png',
      avif: 'image/avif',
    };

    return {
      data: result.binary,
      mimeType: mimeTypes[format] || 'image/webp',
      size: result.binary.length,
    };
  } finally {
    // Clean up
    await pool.close();
  }
}

/**
 * Convert image to base64 data URL
 */
export async function processImageToDataURL(
  imageData: ArrayBuffer | Blob | File,
  options: ProcessOptions = {}
): Promise<string> {
  const result = await processImageWithWASM(imageData, options);
  
  // Convert Uint8Array to base64 more efficiently
  const uint8Array = new Uint8Array(result.data);
  let binary = '';
  const chunkSize = 8192; // Process in chunks to avoid stack overflow
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  const base64 = btoa(binary);
  const dataUrl = `data:${result.mimeType};base64,${base64}`;
  
  // Verify the format
  if (!dataUrl.startsWith(`data:${result.mimeType}`)) {
    console.warn('Unexpected MIME type in data URL:', dataUrl.substring(0, 30));
  }
  
  return dataUrl;
}

/**
 * Optimize image for web (reduce size while maintaining quality)
 */
export async function optimizeImageForWeb(
  imageData: ArrayBuffer | Blob | File,
  maxWidth?: number,
  maxHeight?: number
): Promise<ProcessResult> {
  return processImageWithWASM(imageData, {
    format: 'webp',
    quality: 85,
    resize: maxWidth || maxHeight
      ? {
          width: maxWidth,
          height: maxHeight,
          method: 'lanczos3',
        }
      : undefined,
  });
}

