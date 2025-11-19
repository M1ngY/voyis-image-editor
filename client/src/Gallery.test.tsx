import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Gallery, { ImageItem } from './Gallery';
import * as syncUtils from './syncUtils';

// Mock Viewer component
jest.mock('./Viewer', () => {
  return function MockViewer({ onClose }: { onClose: () => void }) {
    return (
      <div data-testid="viewer">
        <button onClick={onClose}>Close Viewer</button>
      </div>
    );
  };
});

// Mock VirtualizedGallery component
jest.mock('./VirtualizedGallery', () => {
  return function MockVirtualizedGallery({ images }: { images: ImageItem[] }) {
    return (
      <div data-testid="virtualized-gallery">
        Virtualized Gallery ({images.length} images)
      </div>
    );
  };
});

// Mock syncUtils
jest.mock('./syncUtils', () => ({
  loadLocalImages: jest.fn(() => []),
  syncWithServer: jest.fn(),
  getSyncStatus: jest.fn(() => ({
    pending: 0,
    conflicts: 0,
    lastSync: null,
    total: 0,
  })),
  updateLocalImage: jest.fn(),
  removeLocalImage: jest.fn(),
}));

const mockSyncUtils = jest.mocked(syncUtils);
const mockFetch = global.fetch as jest.Mock;

// Mock window.voyisAPI
const mockVoyisAPI = {
  selectImages: jest.fn(),
  selectFolderConfig: jest.fn(),
};

Object.defineProperty(window, 'voyisAPI', {
  value: mockVoyisAPI,
  writable: true,
  configurable: true,
});

const mockFetchResponse = (images: ImageItem[] = []) => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => images,
  });
};

const renderGallery = async () => {
  const view = render(<Gallery />);
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  return view;
};

describe('Gallery Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockFetchResponse();
  });

  it('renders control panel and filter sections', async () => {
    await renderGallery();
    expect(screen.getByRole('heading', { name: /Control Panel/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Filter by File Type/i })).toBeInTheDocument();
  });

  it('fetches images on mount and updates local cache', async () => {
    const mockImages: ImageItem[] = [
      {
        id: 1,
        filename: 'test.jpg',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        size: 1000,
        mimetype: 'image/jpeg',
        thumbnail: '/thumbnails/thumb-test.jpg',
        original: '/uploads/images/test.jpg',
      },
    ];

    mockFetchResponse(mockImages);

    await renderGallery();

    await waitFor(() => {
      expect(mockSyncUtils.updateLocalImage).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });
  });

  it('handles sync button click', async () => {
    mockSyncUtils.syncWithServer.mockResolvedValue({
      success: true,
      addedOrUpdated: [],
      removed: [],
      conflicts: [],
    });

    await renderGallery();

    const syncButton = screen.getByRole('button', { name: /Sync/i });
    await userEvent.click(syncButton);

    await waitFor(() => {
      expect(mockSyncUtils.syncWithServer).toHaveBeenCalled();
    });
  });

  it('displays key action buttons', async () => {
    await renderGallery();
    expect(screen.getByRole('button', { name: /Upload/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Folder Config/i })).toBeInTheDocument();
  });
});

