import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Viewer from './Viewer';

// Mock react-konva
jest.mock('react-konva', () => ({
  Stage: ({ children }: any) => <div data-testid="stage">{children}</div>,
  Layer: ({ children }: any) => <div data-testid="layer">{children}</div>,
  Image: () => <div data-testid="konva-image">Image</div>,
  Rect: () => <div data-testid="rect">Rect</div>,
  Transformer: () => <div data-testid="transformer">Transformer</div>,
}));

// Mock use-image
jest.mock('use-image', () => ({
  __esModule: true,
  default: jest.fn(() => [null, { loading: false, error: null }]),
}));

// Mock WASM processor
jest.mock('./wasmImageProcessor', () => ({
  processImageToDataURL: jest.fn().mockResolvedValue('data:image/webp;base64,test'),
}));

describe('Viewer Component', () => {
  const mockOnClose = jest.fn();
  const mockOnUploadSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render viewer component', () => {
    render(
      <Viewer
        imageUrl="http://localhost:4000/uploads/images/test.jpg"
        onClose={mockOnClose}
      />
    );

    expect(screen.getByTestId('stage')).toBeInTheDocument();
  });

  it('should display close button', () => {
    render(
      <Viewer
        imageUrl="http://localhost:4000/uploads/images/test.jpg"
        onClose={mockOnClose}
      />
    );

    const closeButton = screen.getByText(/Close/i);
    expect(closeButton).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Viewer
        imageUrl="http://localhost:4000/uploads/images/test.jpg"
        onClose={mockOnClose}
      />
    );

    const closeButton = screen.getByText(/Close/i);
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should display WASM toggle button', () => {
    render(
      <Viewer
        imageUrl="http://localhost:4000/uploads/images/test.jpg"
        onClose={mockOnClose}
      />
    );

    const wasmButton = screen.getByText(/WASM/i);
    expect(wasmButton).toBeInTheDocument();
  });

  it('should toggle WASM on/off', async () => {
    const user = userEvent.setup();
    render(
      <Viewer
        imageUrl="http://localhost:4000/uploads/images/test.jpg"
        onClose={mockOnClose}
      />
    );

    const wasmButton = screen.getByText(/WASM OFF/i);
    await user.click(wasmButton);

    await waitFor(() => {
      expect(screen.getByText(/WASM ON/i)).toBeInTheDocument();
    });
  });

  it('should display export and upload buttons', () => {
    render(
      <Viewer
        imageUrl="http://localhost:4000/uploads/images/test.jpg"
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText(/Export/i)).toBeInTheDocument();
    expect(screen.getByText(/Upload/i)).toBeInTheDocument();
  });

  it('should render in embedded mode', () => {
    render(
      <Viewer
        imageUrl="http://localhost:4000/uploads/images/test.jpg"
        onClose={mockOnClose}
        mode="embedded"
        containerSize={{ width: 800, height: 600 }}
      />
    );

    expect(screen.getByTestId('stage')).toBeInTheDocument();
  });
});
