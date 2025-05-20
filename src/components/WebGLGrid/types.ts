export interface GridOptions {
  images: string[];
  pixelRatio?: number;
  columnCount: number;
  rowCount: number;
}

export interface ImageInfo {
  url: string;
  element: HTMLImageElement;
  width: number;
  height: number;
  color: string;
}

export interface GridItem {
  x: number;
  y: number;
  width: number;
  height: number;
  imageIndex: number;
  opacity: number;
  velocity: {
    x: number;
    y: number;
  };
}

export interface GridDimensions {
  itemWidth: number;
  itemHeight: number;
  padding: number;
  columnCount: number;
  rowCount: number;
  totalWidth: number;
  totalHeight: number;
}

export interface WebGLLocations {
  position: number;
  texCoord: number;
  matrix: WebGLUniformLocation;
  texture: WebGLUniformLocation;
  opacity: WebGLUniformLocation;
}

export interface WebGLBuffers {
  position: WebGLBuffer;
  texCoord: WebGLBuffer;
}

export interface BoundEvents {
  mouseDown: (e: MouseEvent) => void;
  mouseMove: (e: MouseEvent) => void;
  mouseUp: (e: MouseEvent) => void;
  touchStart: (e: TouchEvent) => void;
  touchMove: (e: TouchEvent) => void;
  touchEnd: (e: TouchEvent) => void;
  resize: () => void;
}

export interface SceneDimensions {
  width: number;
  height: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TextureObject {
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  textureHDInfo: any;
  opacity: number;
  opacityHD: number;
  opacitySD: number;
  zIndex: number;
}

export interface TextureMatrix {
  scale: {
    x: number;
    y: number;
    z: number;
  };
  translate: {
    x: number;
    y: number;
    z: number;
  };
}
