import '@testing-library/jest-dom';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock TextDecoder/TextEncoder for WASM libraries
// In Node.js, these are available from util module
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = NodeTextDecoder as unknown as typeof global.TextDecoder;
  global.TextEncoder = NodeTextEncoder as unknown as typeof global.TextEncoder;
}

// Mock Canvas API
const canvasPrototype = HTMLCanvasElement.prototype as HTMLCanvasElement & {
  _mockContext?: ReturnType<typeof createMockContext>;
};

function createMockContext() {
  return {
    drawImage: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Uint8Array(4) })),
    putImageData: jest.fn(),
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    scale: jest.fn(),
    transform: jest.fn(),
    setTransform: jest.fn(),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000000',
    fillStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
}

Object.defineProperty(canvasPrototype, 'getContext', {
  configurable: true,
  writable: true,
  value: jest.fn(function (this: HTMLCanvasElement, type: string) {
    if (type === '2d') {
      if (!canvasPrototype._mockContext) {
        canvasPrototype._mockContext = createMockContext();
      }
      return canvasPrototype._mockContext;
    }
    return null;
  }),
});

Object.defineProperty(canvasPrototype, 'toBlob', {
  configurable: true,
  writable: true,
  value: jest.fn(function (callback: (blob: Blob) => void) {
    const blob = new Blob(['test'], { type: 'image/webp' });
    callback(blob);
  }),
});

Object.defineProperty(canvasPrototype, 'toDataURL', {
  configurable: true,
  writable: true,
  value: jest.fn(() => 'data:image/webp;base64,test'),
});

Object.defineProperty(global, 'Image', {
  writable: true,
  value: jest.fn(() => {
    const img = {
      width: 1000,
      height: 800,
      onload: null as (() => void) | null,
      onerror: null as ((error: Error) => void) | null,
      src: '',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    // Simulate async image loading
    setTimeout(() => {
      if (img.onload) img.onload();
    }, 0);
    return img;
  }),
});

// Ensure Blob#arrayBuffer exists in the test environment
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    const length = this.size && this.size > 0 ? this.size : 1;
    const buffer = new Uint8Array(length);
    return Promise.resolve(buffer.buffer);
  };
}

// Mock localStorage - will be overridden in individual tests
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock fetch
global.fetch = jest.fn();

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

