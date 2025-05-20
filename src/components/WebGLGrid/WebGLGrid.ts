import { gsap } from 'gsap';

export class WebGLGrid {
  // Core class properties
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private images: any[] = [];
  private textures: any[] = [];
  private texturesHD: any[] = [];
  private imagesGL: any[] = [];

  // Buffers and locations
  private positionBuffer: WebGLBuffer;
  private texcoordBuffer: WebGLBuffer;
  private positionLocation: number;
  private texcoordLocation: number;
  private matrixLocation: WebGLUniformLocation;
  private textureMatrixLocation: WebGLUniformLocation;
  private textureLocation: WebGLUniformLocation;
  private textureHDLocation: WebGLUniformLocation;
  private timeLocation: WebGLUniformLocation;
  private opacityLocation: WebGLUniformLocation;
  private opacityHDLocation: WebGLUniformLocation;
  private opacitySDLocation: WebGLUniformLocation;
  private grayscaleLocation: WebGLUniformLocation;
  private backgroundRLocation: WebGLUniformLocation;
  private backgroundGLocation: WebGLUniformLocation;
  private backgroundBLocation: WebGLUniformLocation;

  // Grid parameters
  private COLUMN_ITEM_LENGTH: number;
  private ROW_ITEM_LENGTH: number;
  private HORIZONTAL_GAP: number;
  private VERTICAL_GAP: number;
  private ITEM_WIDTH: number;
  private ITEM_HEIGHT: number;
  private ORIGINAL_HORIZONTAL_GAP: number;
  private ORIGINAL_VERTICAL_GAP: number;
  private ORIGINAL_ITEM_WIDTH: number;
  private ORIGINAL_ITEM_HEIGHT: number;

  // State tracking
  private isInit = false;
  private isDestroyed = false;
  public isIntroShown = false;
  private HDImagesHasBeenLoaded = false;
  private pixelRatio: number;
  private windowSize: { width: number; height: number };
  private mouse = { x: 0, y: 0 };
  private lerpedMouse = { x: 0, y: 0 };
  private prevLerpedMouse = { x: 0, y: 0 };
  private offset = { x: 0, y: 0 };
  private scroll = { x: 0, y: 0 };
  private lerpedScroll = { x: 0, y: 0 };
  private prevLerpedScroll = { x: 0, y: 0 };
  private velocity = { x: 0, y: 0 };
  private isDragging = false;
  private currentZoom = 1;
  private time = 0;
  public grayscale = 1;
  private TLIntro: gsap.core.Timeline;
  private introTimer: gsap.core.Tween;
  private introMostlyDoneTimer: gsap.core.Tween;
  private anchorLeft: number;
  private anchorCenterLeft: number = 0;
  private anchorTop: number;
  private anchorCenterTop: number = 0;
  private centerCameraOffsetX: number;
  private centerCameraOffsetY: number;
  private fileFormat: string = 'webp'; // Default format
  public vs: any; // Virtual scroll instance
  private resizeObserver: ResizeObserver | null = null;
  private indexTextureSD = 0;
  private isMobile: boolean;
  private canvasElement: HTMLCanvasElement; // Renamed from 'canvas' to avoid conflict with getter
  private boundHandleResize: () => void;
  private delayIntroAnimation = false; // Flag to delay intro animation
  private texturesLoaded = false; // Flag to track if textures are loaded

  public onIntroMostlyDone: (() => void) | null = null;
  private drawnPositions: Set<string> = new Set();

  // Fragment shader
  private fragmentShader = `
  precision highp float;
    
  varying vec2 v_texcoord;
  uniform sampler2D u_texture;
  uniform sampler2D u_textureHD;
  uniform float u_time;
  uniform float u_opacity;
  uniform float u_opacity_texture_hd;
  uniform float u_opacity_texture_sd;
  uniform float u_grayscale;
  uniform float u_r;
  uniform float u_g;
  uniform float u_b;
  
  void main() {
    if (v_texcoord.x < 0.0 ||
      v_texcoord.y < 0.0 ||
      v_texcoord.x > 1.0 ||
      v_texcoord.y > 1.0) {
      gl_FragColor = vec4(0.0588, 0.0588, 0.0588, 1.0); // #0F0F0F
      return;
    }
    vec4 texture = texture2D(u_texture, v_texcoord);
    vec4 textureHD = texture2D(u_textureHD, v_texcoord);
    vec4 colorBackground = vec4(0.0588, 0.0588, 0.0588, 1.0); // #0F0F0F
    vec4 backgroundMixTexture = mix(colorBackground, texture, u_opacity_texture_sd);
    vec4 colorMixTexture = mix(backgroundMixTexture, textureHD, u_opacity_texture_hd);
    
    vec3 lum = vec3(0.299, 0.587, 0.114);
    vec3 gray = vec3(dot(lum, colorMixTexture.rgb));
    gl_FragColor = vec4(mix(colorMixTexture.rgb, gray, u_grayscale), 1.0);
  }`;

  // Vertex shader
  private vertexShader = `
    attribute vec4 a_position;
    attribute vec2 a_texcoord;
    uniform mat4 u_matrix;
    uniform mat4 u_textureMatrix;
    varying vec2 v_texcoord;
    
    void main() {
      gl_Position = u_matrix * a_position;
      v_texcoord = (u_textureMatrix * vec4(a_texcoord, 0, 1)).xy;
    }
  `;

  constructor(
    canvas: HTMLCanvasElement,
    originalImages: any[],
    isMobile: boolean,
    delayIntro = false
  ) {
    this.canvasElement = canvas;
    this.isMobile = isMobile;
    this.delayIntroAnimation = delayIntro;

    // Set constants based on mobile status
    if (isMobile) {
      // Conservative settings for mobile - prevents memory issues
      this.COLUMN_ITEM_LENGTH = Math.min(window.innerWidth < 480 ? 39 : 49, 49);
      this.ROW_ITEM_LENGTH = Math.min(window.innerWidth < 480 ? 15 : 20, 20);

      // Cap pixel ratio on mobile to reduce memory usage
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2.0);
    } else {
      this.COLUMN_ITEM_LENGTH = 79;
      this.ROW_ITEM_LENGTH = 30;
      this.pixelRatio = window.devicePixelRatio || 1;
    }

    // Shuffle images without limiting them
    const shuffledImages = this.randomizeArray(originalImages);
    this.images = [...shuffledImages, ...this.randomizeArray(shuffledImages)];

    // FIXED: Initialize WebGL context first to get canvas dimensions
    this.gl = canvas.getContext('webgl', {
      antialias: !isMobile, // Disable antialiasing on mobile to save performance
      premultipliedAlpha: false,
      alpha: false,
    });

    // FIXED: Force canvas to full container size
    this.fixCanvasSize();

    // FIXED: Now get the actual canvas dimensions after sizing
    this.windowSize = {
      width: canvas.width,
      height: canvas.height,
    };

    // Initialize grid spacing and item dimensions
    this.HORIZONTAL_GAP = 10 * this.pixelRatio;
    this.VERTICAL_GAP = 10 * this.pixelRatio;
    this.ITEM_WIDTH = 90 * this.pixelRatio;
    this.ITEM_HEIGHT = 140 * this.pixelRatio;
    this.ORIGINAL_HORIZONTAL_GAP = this.HORIZONTAL_GAP;
    this.ORIGINAL_VERTICAL_GAP = this.VERTICAL_GAP;
    this.ORIGINAL_ITEM_WIDTH = this.ITEM_WIDTH;
    this.ORIGINAL_ITEM_HEIGHT = this.ITEM_HEIGHT;

    // Bind the resize handler once to preserve reference for proper cleanup
    this.boundHandleResize = this.setWindow.bind(this);

    // Initialize the grid
    this.init();

    // Setup resize observer for the canvas
    this.setupResizeObserver(canvas);
  }

  // New method to explicitly start the intro sequence
  public startIntroSequence(): void {
    if (this.isIntroShown) {
      return;
    }

    if (!this.texturesLoaded) {
      return;
    }

    this.introSequence();
  }

  // Setup a ResizeObserver to watch for canvas size changes
  private setupResizeObserver(canvas: HTMLCanvasElement) {
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === canvas) {
            this.setWindow();
          }
        }
      });
      this.resizeObserver.observe(canvas);
    } else {
      // Fallback for browsers without ResizeObserver
      window.addEventListener('resize', this.boundHandleResize);
    }
  }

  // Improved lerp function with precision handling
  private lerp(start: number, end: number, t: number): number {
    // If values are very close, just return the target to avoid floating point issues
    if (Math.abs(end - start) <= 0.001) {
      return end;
    }
    return start * (1 - t) + end * t;
  }

  private hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }

  // Shuffle array without limiting
  private randomizeArray(arr: any[]): any[] {
    const array = [...arr]; // Create a copy

    // Fisher-Yates shuffle
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
  }

  // Check if a format is supported
  private async isFormatSupported(format: string, base64Data: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = `data:image/${format};base64,${base64Data}`;

      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error(`${format.toUpperCase()} format not supported`));
    });
  }

  // Initialize WebGL setup
  private async init() {
    try {
      // Check for modern format support (AVIF/WebP)
      const avifSupported = await this.isFormatSupported(
        'avif',
        'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A='
      ).catch(() => false);

      const webpSupported = await this.isFormatSupported(
        'webp',
        'UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA'
      ).catch(() => false);

      // Set the file format based on browser support
      this.fileFormat = avifSupported ? 'avif' : webpSupported ? 'webp' : 'originalFormat';

      // Initialize main WebGL setup
      this.main();

      // Set window size
      this.setWindow();

      // Mark as initialized
      this.isInit = true;
    } catch (error) {}
  }

  // FIXED: Main setup method with better canvas sizing
  private main() {
    // Make sure canvas is sized properly before anything else
    this.fixCanvasSize();

    // Enable WebGL features
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.cullFace(this.gl.BACK);
    this.gl.enable(this.gl.BLEND);
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // Set initial clear color to match site background
    this.gl.clearColor(0.0588, 0.0588, 0.0588, 1.0);

    // Create shader program
    const vertexShader = this.createShader(this.vertexShader, this.gl.VERTEX_SHADER);
    const fragmentShader = this.createShader(this.fragmentShader, this.gl.FRAGMENT_SHADER);
    this.program = this.createProgram(vertexShader, fragmentShader);

    // Get attribute and uniform locations
    this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
    this.texcoordLocation = this.gl.getAttribLocation(this.program, 'a_texcoord');
    this.matrixLocation = this.gl.getUniformLocation(this.program, 'u_matrix');
    this.textureMatrixLocation = this.gl.getUniformLocation(this.program, 'u_textureMatrix');
    this.textureLocation = this.gl.getUniformLocation(this.program, 'u_texture');
    this.timeLocation = this.gl.getUniformLocation(this.program, 'u_time');
    this.opacityLocation = this.gl.getUniformLocation(this.program, 'u_opacity');
    this.textureHDLocation = this.gl.getUniformLocation(this.program, 'u_textureHD');
    this.opacityHDLocation = this.gl.getUniformLocation(this.program, 'u_opacity_texture_hd');
    this.opacitySDLocation = this.gl.getUniformLocation(this.program, 'u_opacity_texture_sd');
    this.grayscaleLocation = this.gl.getUniformLocation(this.program, 'u_grayscale');
    this.backgroundRLocation = this.gl.getUniformLocation(this.program, 'u_r');
    this.backgroundGLocation = this.gl.getUniformLocation(this.program, 'u_g');
    this.backgroundBLocation = this.gl.getUniformLocation(this.program, 'u_b');

    // Create position buffer (for vertex positions)
    this.positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1]),
      this.gl.STATIC_DRAW
    );

    // Create texcoord buffer (for texture coordinates)
    this.texcoordBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texcoordBuffer);
    const texcoords = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(texcoords), this.gl.STATIC_DRAW);

    // Process images for the grid
    const maxImages = this.COLUMN_ITEM_LENGTH * this.ROW_ITEM_LENGTH;
    const selectedImages = [];
    for (let i = 0; i < maxImages; i++) {
      selectedImages.push(this.images[i % this.images.length]);
    }

    // Prepare image data for processing
    const imageData = [];
    selectedImages.forEach((img) => {
      const source = this.getImageSource(img);
      const sourceHD = this.getImageSource(img, true);
      imageData.push({
        source,
        sourceHD,
        textureMediumUrl: img.file.url,
        width: img.file.details.image.width,
        height: img.file.details.image.height,
        backgroundColor: img.file.color,
      });
    });

    // Create texture tracking array
    const processedSources = [];

    // Create textures for all images
    this.textures = this.images
      .map((img) => {
        const source = this.getImageSource(img);
        if (!processedSources.includes(source)) {
          processedSources.push(source);
          return this.createImageTexture(this.gl, source, img.file.color, () =>
            this.onTextureSDLoaded()
          );
        }
        return null;
      })
      .filter((texture) => texture !== null);

    // Create HD textures where needed
    this.texturesHD = this.images
      .map((img) => {
        if (!this.needHDTexture(img)) return null;

        const source = this.getImageSource(img, true);
        if (!processedSources.includes(source)) {
          processedSources.push(source);
          return this.createImageTexture(
            this.gl,
            source,
            img.file.color,
            () => this.onTextureHDLoaded(),
            false
          );
        }
        return null;
      })
      .filter((texture) => texture !== null);

    // Set canvas size based on container size
    this.updateCanvasSize(this.gl.canvas as HTMLCanvasElement);

    // Update windowSize with actual canvas dimensions
    this.windowSize = {
      width: this.gl.canvas.width,
      height: this.gl.canvas.height,
    };

    // Initialize image grid
    this.imagesGL = [];
    this.indexTextureSD = 0;

    // Create all grid items
    const count = selectedImages.length;
    for (let i = 0; i < count; i++) {
      const imageInfo = imageData[i];
      const gridItem = this.createGridItem(this.gl, {
        texture: this.textures.find((tex) => tex.source === imageInfo.source),
        textureHD: this.texturesHD.find((tex) => tex?.source === imageInfo.sourceHD),
        source: imageInfo.source,
        textureURL: imageInfo.textureMediumUrl,
        textureWidth: imageInfo.width,
        textureHeight: imageInfo.height,
        backgroundColor: imageInfo.backgroundColor,
        index: i,
      });

      this.imagesGL.push(gridItem);
    }

    // Set initial grid layout
    this.setSizeItemsDefault();

    // Set initial zoom to small value for intro animation
    this.currentZoom = 0.4;
    this.applyZoom(this.currentZoom);

    // Start rendering
    requestAnimationFrame(() => this.render(0));
  }

  // Modified onTextureSDLoaded to respect delayed intro and NOT fade in textures yet
  private onTextureSDLoaded() {
    this.indexTextureSD++;
    if (this.indexTextureSD === this.textures.length) {
      // Mark textures as loaded but don't fade them in yet
      this.texturesLoaded = true;

      // Update cursor and hide loading
      document.body.style.cursor = 'default';
      const loading = document.querySelector('.loading');
      if (loading) loading.classList.add('loaded');

      // Start intro animation only if not delayed
      if (!this.delayIntroAnimation) {
        this.introSequence();
      } else {
      }
    }
  }

  // Create shader
  private createShader(source: string, type: number): WebGLShader {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile error: ${this.gl.getShaderInfoLog(shader)}`);
    }

    return shader;
  }

  // Create shader program
  private createProgram(vertShader: WebGLShader, fragShader: WebGLShader): WebGLProgram {
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertShader);
    this.gl.attachShader(program, fragShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${this.gl.getProgramInfoLog(program)}`);
    }

    return program;
  }

  // Handler for HD texture loading
  private onTextureHDLoaded() {
    // HD textures are loaded on demand
  }

  // Create image texture
  private createImageTexture(
    gl: WebGLRenderingContext,
    source: string,
    backgroundColor: string,
    callback: () => void,
    loadImmediately = true
  ) {
    // Create texture handler object
    const textureObj = {
      gl,
      source,
      backgroundColor,
      opacity: 0,
      width: 1,
      height: 1,
      texture: null,
      r: 0,
      g: 0,
      b: 0,
      isInit: false,
      isLoaded: false,
      callbackLoaded: callback,

      // Create initial texture
      createTexture() {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Convert hex color to RGB
        const { r, g, b } = this.hexToRgb(backgroundColor);
        this.r = r / 255;
        this.g = g / 255;
        this.b = b / 255;

        // Create 1x1 pixel texture initially
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          1,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array([0, 0, 255, 255])
        );

        // Set texture parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        this.width = 1;
        this.height = 1;
        this.texture = texture;

        return texture;
      },

      // Update texture with loaded image
      updateTexture(image: HTMLImageElement) {
        this.width = image.width;
        this.height = image.height;
        this.isLoaded = true;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      },

      // Fade in texture
      fadeTextureIn() {
        gsap.to(this, {
          duration: 0.5,
          opacity: 1,
          ease: 'power2.out',
          delay: 0.2 * Math.random() + 0.1,
        });
      },

      // Load texture from source
      load() {
        if (this.isInit) return Promise.resolve();

        return new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = '';

          img.addEventListener('load', () => {
            this.updateTexture(img);
            this.callbackLoaded();
            resolve();
          });

          img.decoding = 'async';
          img.src = source;
        });
      },

      // Parse hex color
      hexToRgb(hex: string) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
            }
          : { r: 0, g: 0, b: 0 };
      },

      // Cleanup
      destroy() {
        if (this.texture) {
          try {
            gl.deleteTexture(this.texture);
            this.texture = null;
          } catch (e) {}
        }
      },
    };

    // Create the texture
    textureObj.createTexture();

    // Load if requested
    if (loadImmediately) {
      textureObj.load();
      textureObj.isInit = true;
    }

    return textureObj;
  }

  // Create a grid item
  private createGridItem(gl: WebGLRenderingContext, options: any) {
    const { texture, textureHD, source, textureWidth, textureHeight, backgroundColor, index } =
      options;

    // Create empty texture
    const createEmptyTexture = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 255, 255])
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return {
        width: 1,
        height: 1,
        texture,
      };
    };

    // Create object to manage grid item
    const item = {
      gl,
      program: this.program,
      positionBuffer: this.positionBuffer,
      texcoordBuffer: this.texcoordBuffer,
      positionLocation: this.positionLocation,
      texcoordLocation: this.texcoordLocation,
      matrixLocation: this.matrixLocation,
      textureMatrixLocation: this.textureMatrixLocation,
      textureLocation: this.textureLocation,
      textureHDLocation: this.textureHDLocation,
      opacityLocation: this.opacityLocation,
      opacitySDLocation: this.opacitySDLocation,
      backgroundRLocation: this.backgroundRLocation,
      backgroundGLocation: this.backgroundGLocation,
      backgroundBLocation: this.backgroundBLocation,
      opacityHDLocation: this.opacityHDLocation,
      index,
      source,
      textureWidth,
      textureHeight,
      texture,
      textureHD,
      r: 0,
      g: 0,
      b: 0,
      isPaused: false,
      isVisible: false,
      bounds: {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      },
      sceneDimensions: {
        width: window.innerWidth * this.pixelRatio,
        height: window.innerHeight * this.pixelRatio,
      },
      textureObject: {
        x: 0,
        y: 0,
        dx: 0,
        dy: 0,
        width: 1,
        height: 1,
        displayWidth: 1,
        displayHeight: 1,
        textureHDInfo: createEmptyTexture(),
        opacity: 1,
        opacityHD: 0,
        opacitySD: 0,
        zIndex: 0,
      },
      textureMatrix: {
        scale: {
          x: 1,
          y: 1,
          z: 1,
        },
        translate: {
          x: 0,
          y: 0,
          z: 0,
        },
      },
      itemWidth: 0,
      itemHeight: 0,

      // Update item size
      updateSize(x: number, y: number, width: number) {
        this.textureObject.opacity = 1;
        this.textureObject.x = x;
        this.textureObject.y = y;
        this.textureObject.displayWidth = width;
        this.textureObject.displayHeight = Math.round(
          (width * this.textureHeight) / this.textureWidth
        );
        return x + this.textureObject.displayWidth;
      },

      // Update bounds
      updateBounds(
        dimensions: any,
        itemWidth: number,
        itemHeight: number,
        offsetX: number,
        offsetY: number
      ) {
        // Important: These bounds define the wrapping area for the infinite grid
        this.bounds.left = -offsetX;
        this.bounds.right = dimensions.width - offsetX;
        this.bounds.top = -offsetY;
        this.bounds.bottom = dimensions.height - offsetY;

        this.itemWidth = itemWidth;
        this.itemHeight = itemHeight;
      },

      // FIX: Update position with proper wrapping logic
      update(delta: { x: number; y: number }) {
        // Apply position delta
        this.textureObject.x += delta.x;
        this.textureObject.y += delta.y;

        // Wrap around horizontally - FIXED LOGIC
        if (this.textureObject.x <= this.bounds.left) {
          const offset = this.bounds.left - this.textureObject.x;
          this.textureObject.x = this.bounds.right - offset - this.itemWidth;
        } else if (this.textureObject.x >= this.bounds.right) {
          const offset = this.bounds.right - this.textureObject.x; // Notice sign change
          this.textureObject.x = this.bounds.left - offset + this.itemWidth; // Added itemWidth
        }

        // Wrap around vertically - FIXED LOGIC
        if (this.textureObject.y <= this.bounds.top) {
          const offset = this.bounds.top - this.textureObject.y;
          this.textureObject.y = this.bounds.bottom - offset - this.itemHeight;
        } else if (this.textureObject.y >= this.bounds.bottom) {
          const offset = this.bounds.bottom - this.textureObject.y; // Notice sign change
          this.textureObject.y = this.bounds.top - offset + this.itemHeight; // Added itemHeight
        }
      },

      // Draw the item
      draw() {
        const obj = this.textureObject;
        const { x } = obj;
        const { y } = obj;
        const width = obj.displayWidth;
        const height = obj.displayHeight;

        // Check if visible in viewport
        const viewport = {
          x1: 0,
          y1: 0,
          x2: this.sceneDimensions.width,
          y2: this.sceneDimensions.height,
        };

        // Check if this item is visible
        this.isVisible = this.overlaps(viewport, {
          x1: x,
          y1: y,
          x2: x + width,
          y2: y + height,
        });

        // Only draw if visible
        if (this.isVisible) {
          this.drawImage(
            this.texture.texture,
            this.textureHD ? this.textureHD.texture : this.texture.textureHDInfo,
            this.texture.width,
            this.texture.height,
            x,
            y,
            width,
            height,
            obj.opacity,
            this.textureHD ? this.textureHD.opacity : 0,
            this.texture.opacity
          );
        }
      },

      // FIX: Improved draw image method
      drawImage(
        texture,
        textureHD,
        textureWidth,
        textureHeight,
        x,
        y,
        width,
        height,
        opacity,
        opacityHD,
        opacitySD
      ) {
        if (width === undefined) width = textureWidth;
        if (height === undefined) height = textureHeight;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, textureHD);

        gl.useProgram(this.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        gl.enableVertexAttribArray(this.texcoordLocation);
        gl.vertexAttribPointer(this.texcoordLocation, 2, gl.FLOAT, false, 0, 0);

        // Create matrix transform
        const canvasWidth = gl.canvas.width;
        const canvasHeight = gl.canvas.height;

        // Create orthographic projection matrix (2D)
        const matrix = new Float32Array(16);
        matrix[0] = 2 / canvasWidth;
        matrix[1] = 0;
        matrix[2] = 0;
        matrix[3] = 0;
        matrix[4] = 0;
        matrix[5] = -2 / canvasHeight;
        matrix[6] = 0;
        matrix[7] = 0;
        matrix[8] = 0;
        matrix[9] = 0;
        matrix[10] = 2 / 2; // z-range from -1 to 1
        matrix[11] = 0;
        matrix[12] = -1;
        matrix[13] = 1;
        matrix[14] = 0;
        matrix[15] = 1;

        // Apply translation
        const translationMatrix = new Float32Array(16);
        // Matrix
        for (let i = 0; i < 16; i++) {
          translationMatrix[i] = matrix[i];
        }
        // Apply translation
        translationMatrix[12] = matrix[0] * x + matrix[4] * y + matrix[8] * 0 + matrix[12];
        translationMatrix[13] = matrix[1] * x + matrix[5] * y + matrix[9] * 0 + matrix[13];
        translationMatrix[14] = matrix[2] * x + matrix[6] * y + matrix[10] * 0 + matrix[14];
        translationMatrix[15] = matrix[3] * x + matrix[7] * y + matrix[11] * 0 + matrix[15];

        // Apply scaling
        const scalingMatrix = new Float32Array(16);
        // Apply scaling to specific elements
        scalingMatrix[0] = width * translationMatrix[0];
        scalingMatrix[1] = width * translationMatrix[1];
        scalingMatrix[2] = width * translationMatrix[2];
        scalingMatrix[3] = width * translationMatrix[3];
        scalingMatrix[4] = height * translationMatrix[4];
        scalingMatrix[5] = height * translationMatrix[5];
        scalingMatrix[6] = height * translationMatrix[6];
        scalingMatrix[7] = height * translationMatrix[7];
        scalingMatrix[8] = 1 * translationMatrix[8];
        scalingMatrix[9] = 1 * translationMatrix[9];
        scalingMatrix[10] = 1 * translationMatrix[10];
        scalingMatrix[11] = 1 * translationMatrix[11];
        // Copy remaining elements
        scalingMatrix[12] = translationMatrix[12];
        scalingMatrix[13] = translationMatrix[13];
        scalingMatrix[14] = translationMatrix[14];
        scalingMatrix[15] = translationMatrix[15];

        // Create texture matrix
        const textureMatrix = new Float32Array(16);
        textureMatrix[0] = this.textureMatrix.scale.x;
        textureMatrix[1] = 0;
        textureMatrix[2] = 0;
        textureMatrix[3] = 0;
        textureMatrix[4] = 0;
        textureMatrix[5] = this.textureMatrix.scale.y;
        textureMatrix[6] = 0;
        textureMatrix[7] = 0;
        textureMatrix[8] = 0;
        textureMatrix[9] = 0;
        textureMatrix[10] = this.textureMatrix.scale.z;
        textureMatrix[11] = 0;
        textureMatrix[12] = 0;
        textureMatrix[13] = 0;
        textureMatrix[14] = 0;
        textureMatrix[15] = 1;

        // Set uniforms
        gl.uniformMatrix4fv(this.matrixLocation, false, scalingMatrix);
        gl.uniformMatrix4fv(this.textureMatrixLocation, false, textureMatrix);
        gl.uniform1i(this.textureLocation, 0);
        gl.uniform1i(this.textureHDLocation, 1);
        gl.uniform1f(this.opacityLocation, opacity);
        gl.uniform1f(this.opacityHDLocation, opacityHD);
        gl.uniform1f(this.opacitySDLocation, opacitySD);
        gl.uniform1f(this.backgroundRLocation, this.texture.r);
        gl.uniform1f(this.backgroundGLocation, this.texture.g);
        gl.uniform1f(this.backgroundBLocation, this.texture.b);

        // Draw triangles
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },

      // Check if rectangles overlap
      overlaps(rectA: any, rectB: any) {
        return !(
          rectA.x1 >= rectB.x2 ||
          rectB.x1 >= rectA.x2 ||
          rectA.y1 >= rectB.y2 ||
          rectB.y1 >= rectA.y2
        );
      },

      // Update scene dimensions
      setWindow(dimensions: { width: number; height: number }) {
        this.sceneDimensions = dimensions;
      },

      // Cleanup - now it properly cleans resources
      destroy() {
        // Just a stub - actual cleanup is handled at WebGLGrid level
      },
    };

    return item;
  }

  // Set default size and positions of all items with fixed centering
  private setSizeItemsDefault() {
    let row = -1;
    let x = 0;
    let y = 0;

    this.imagesGL.forEach((item, index) => {
      if (index % this.COLUMN_ITEM_LENGTH === 0) {
        row++;
        x = 0;
        y = row * (this.ITEM_HEIGHT + this.VERTICAL_GAP);
      }

      item.updateSize(x, y, this.ITEM_WIDTH);
      x += this.ITEM_WIDTH + this.HORIZONTAL_GAP;
    });

    // Calculate total dimensions
    const dimensions = this.getTotalDimensionsItems();

    // Calculate center offset
    this.centerCameraOffsetX = (dimensions.width - this.HORIZONTAL_GAP - this.windowSize.width) / 2;
    this.centerCameraOffsetY = (dimensions.height - this.VERTICAL_GAP - this.windowSize.height) / 2;

    // Apply center offset to all items
    this.imagesGL.forEach((item) => {
      item.textureObject.x -= this.centerCameraOffsetX;
      item.textureObject.y -= this.centerCameraOffsetY;
      item.updateBounds(
        dimensions,
        this.ITEM_WIDTH + this.HORIZONTAL_GAP,
        this.ITEM_HEIGHT + this.VERTICAL_GAP,
        this.centerCameraOffsetX,
        this.centerCameraOffsetY
      );
    });

    this.anchorLeft = this.imagesGL[0].textureObject.x;
    this.anchorCenterLeft = this.windowSize.width / 32;

    this.anchorTop = this.imagesGL[0].textureObject.y;
    this.anchorCenterTop = this.windowSize.height / 32;
  }

  // Get total dimensions of all items
  private getTotalDimensionsItems() {
    let minX,
      maxX = 0,
      minY,
      maxY = 0;

    this.imagesGL.forEach((item) => {
      const { x, y } = item.textureObject;

      if (minX === undefined || x <= minX) minX = x;
      if (x >= maxX) maxX = x;

      if (minY === undefined || y <= minY) minY = y;
      if (y >= maxY) maxY = y;
    });

    return {
      width: maxX - minX + this.ITEM_WIDTH + this.HORIZONTAL_GAP,
      height: maxY - minY + this.ITEM_HEIGHT + this.VERTICAL_GAP,
    };
  }

  // FIXED: New method to handle initial canvas sizing
  private fixCanvasSize(): void {
    const canvas = this.canvasElement;
    const container = canvas.parentElement;

    if (container) {
      // Set canvas display size to match container
      canvas.style.width = '100%';
      canvas.style.height = '100%';

      // Get the actual display size of the canvas
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      // If dimensions are very small, it might mean the container isn't sized yet
      // In that case, use the window dimensions as a fallback
      const width = displayWidth > 100 ? displayWidth : window.innerWidth;
      const height = displayHeight > 100 ? displayHeight : window.innerHeight;

      // Set canvas internal dimensions to match display size * pixel ratio
      canvas.width = width * this.pixelRatio;
      canvas.height = height * this.pixelRatio;

      // Set the viewport to match
      this.gl.viewport(0, 0, canvas.width, canvas.height);
    } else {
      // Fallback if no container
      canvas.width = window.innerWidth * this.pixelRatio;
      canvas.height = window.innerHeight * this.pixelRatio;
      this.gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  // FIXED: Update canvas size with better container handling
  private updateCanvasSize(canvas: HTMLCanvasElement): boolean {
    // Get the container size
    const container = canvas.parentElement;
    let displayWidth = canvas.clientWidth;
    let displayHeight = canvas.clientHeight;

    // If dimensions are very small, it might mean the container isn't sized yet
    if (displayWidth < 100 || displayHeight < 100) {
      if (container) {
        displayWidth = container.clientWidth;
        displayHeight = container.clientHeight;
      } else {
        displayWidth = window.innerWidth;
        displayHeight = window.innerHeight;
      }
    }

    const { pixelRatio } = this;
    const newWidth = Math.floor(displayWidth * pixelRatio);
    const newHeight = Math.floor(displayHeight * pixelRatio);

    // Only resize if dimensions have changed significantly (avoid sub-pixel issues)
    if (Math.abs(canvas.width - newWidth) > 2 || Math.abs(canvas.height - newHeight) > 2) {
      canvas.width = newWidth;
      canvas.height = newHeight;
      return true; // Indicate that size changed
    }
    return false;
  }

  // FIX: Improved update method with better lerping
  private update() {
    // Apply smooth lerping to scroll with improved precision
    this.lerpedScroll.x = this.lerp(this.lerpedScroll.x, this.scroll.x, 0.12);
    this.lerpedScroll.y = this.lerp(this.lerpedScroll.y, this.scroll.y, 0.12);

    const deltaScrollX = this.lerpedScroll.x - this.prevLerpedScroll.x;
    const deltaScrollY = this.lerpedScroll.y - this.prevLerpedScroll.y;

    this.prevLerpedScroll.x = this.lerpedScroll.x;
    this.prevLerpedScroll.y = this.lerpedScroll.y;

    if (this.isDragging) {
      // Apply smooth lerping to mouse movement with improved precision
      this.lerpedMouse.x = this.lerp(this.lerpedMouse.x, this.mouse.x, 0.075);
      this.lerpedMouse.y = this.lerp(this.lerpedMouse.y, this.mouse.y, 0.075);

      const deltaMouseX = this.lerpedMouse.x - this.prevLerpedMouse.x;
      const deltaMouseY = this.lerpedMouse.y - this.prevLerpedMouse.y;

      this.prevLerpedMouse.x = this.lerpedMouse.x;
      this.prevLerpedMouse.y = this.lerpedMouse.y;

      this.velocity.x = deltaMouseX;
      this.velocity.y = deltaMouseY;

      // Apply combined delta to grid items
      const delta = {
        x: deltaScrollX + deltaMouseX,
        y: deltaScrollY + deltaMouseY,
      };

      this.imagesGL.forEach((item) => item.update(delta));
    } else {
      // Apply momentum with friction
      this.velocity.x *= 0.95;
      this.velocity.y *= 0.95;

      const delta = {
        x: deltaScrollX + this.velocity.x,
        y: deltaScrollY + this.velocity.y,
      };

      this.imagesGL.forEach((item) => item.update(delta));
    }
  }

  // FIXED: Improved draw method with better sizing handling
  private draw() {
    // Clear the set of drawn positions at the start of each frame
    this.drawnPositions.clear();

    const canvas = this.gl.canvas as HTMLCanvasElement;

    // Always check if canvas size needs updating
    if (this.updateCanvasSize(canvas)) {
      // If canvas size changed, update windowSize too
      this.windowSize = {
        width: canvas.width,
        height: canvas.height,
      };

      // Update viewport to match new canvas size
      this.gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // Clear canvas with our dark gray color
    this.gl.clearColor(0.0588, 0.0588, 0.0588, 1.0); // #0F0F0F
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    // Draw grid items with duplicate prevention
    this.imagesGL.forEach((item) => {
      // Check if this position has already been drawn to
      const posKey = `${Math.round(item.textureObject.x)},${Math.round(item.textureObject.y)}`;

      if (!this.drawnPositions.has(posKey)) {
        // Position hasn't been drawn to yet, draw the item
        item.draw();

        // Mark this position as drawn
        this.drawnPositions.add(posKey);

        // Load HD texture for visible items when zoomed in
        if (this.currentZoom > 8 && item.isVisible && item.textureHD) {
          item.textureHD.load();
        }
      }
    });
  }

  // Main render loop
  public render(time = 0) {
    if (!this.isInit || this.isDestroyed) return false;

    this.update();
    this.draw();

    // Update grayscale uniform
    this.gl.useProgram(this.program);
    this.gl.uniform1f(this.grayscaleLocation, this.grayscale);

    return true;
  }

  // Get image source URL with appropriate format and size - optimized for mobile
  private getImageSource(image: any, isHD = false): string {
    const format =
      this.fileFormat === 'originalFormat'
        ? image.file.contentType === 'image/jpeg'
          ? 'jpeg'
          : 'png'
        : this.fileFormat;

    // Optimize size based on device
    const size = isHD
      ? this.isMobile
        ? 800
        : 1600 // Smaller HD on mobile
      : this.isMobile
        ? 400
        : 800; // Smaller standard on mobile

    // Optimize quality based on device - mobile gets lower quality to save memory
    const quality = isHD
      ? this.isMobile
        ? 65
        : 80 // Lower quality on mobile
      : this.isMobile
        ? 55
        : 70;

    // Limit size to original image dimensions
    const requestedSize = Math.min(size * this.pixelRatio, image.file.details.image.height);

    return `${image.file.url}?h=${Math.ceil(requestedSize)}&fm=${format}&q=${quality}&fit=fill`;
  }

  // Check if HD texture is needed based on image dimensions
  private needHDTexture(image: any): boolean {
    // Be more selective about HD textures on mobile
    if (this.isMobile) {
      // Only load HD on mobile for significantly large images
      const standardSize = 500 * this.pixelRatio;
      return image.file.details.image.height > standardSize * 1.5;
    }

    const hdSize = (this.isMobileViewport() ? 1000 : 1600) * this.pixelRatio;
    const buffer = 400 * this.pixelRatio;

    return image.file.details.image.height + buffer >= hdSize;
  }

  // Check if current viewport is mobile
  private isMobileViewport(): boolean {
    return window.innerWidth <= 960;
  }

  // Bind events for user interaction
  public bindEvents() {
    this.canvasElement.addEventListener('mousedown', this.handleMouseDown);
    this.canvasElement.addEventListener('touchstart', this.handleMouseDown);
  }

  // Unbind events
  public unbindEvents() {
    if (this.canvasElement) {
      this.canvasElement.removeEventListener('mousedown', this.handleMouseDown);
      this.canvasElement.removeEventListener('touchstart', this.handleMouseDown);
    }

    // Clean up document-level event listeners too
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('touchmove', this.handleMouseMove);
    document.removeEventListener('touchend', this.handleMouseUp);

    // Use the bound reference for resize listener
    if (!this.resizeObserver) {
      window.removeEventListener('resize', this.boundHandleResize);
    }
  }

  // Mouse down handler
  private handleMouseDown = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    this.isDragging = true;

    // Calculate offset
    const rect = this.canvasElement.getBoundingClientRect();
    this.offset.x = clientX - rect.left;
    this.offset.y = clientY - rect.top;

    // Reset mouse values
    this.mouse.x = 0;
    this.mouse.y = 0;
    this.lerpedMouse.x = 0;
    this.lerpedMouse.y = 0;
    this.prevLerpedMouse.x = this.lerpedMouse.x;
    this.prevLerpedMouse.y = this.lerpedMouse.y;

    // Add document-level event listeners
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('touchmove', this.handleMouseMove);
    document.addEventListener('touchend', this.handleMouseUp);
  };

  // Mouse move handler
  private handleMouseMove = (e: MouseEvent | TouchEvent) => {
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    // Calculate deltas
    const deltaX = clientX - this.offset.x;
    const deltaY = clientY - this.offset.y;
    this.offset.x = clientX;
    this.offset.y = clientY;

    // Limit extreme movements
    const limit = this.isMobileViewport() || this.currentZoom >= 3 ? 1000 : 100;
    const limitedDeltaX = Math.min(Math.max(deltaX, -limit), limit);
    const limitedDeltaY = Math.min(Math.max(deltaY, -limit), limit);

    // Update mouse position
    this.mouse.x += limitedDeltaX * this.pixelRatio * 2;
    this.mouse.y += limitedDeltaY * this.pixelRatio * 2;
  };

  // Mouse up handler
  private handleMouseUp = () => {
    this.isDragging = false;

    // Boost velocity for mobile
    if (this.isMobileViewport() || this.currentZoom > 3) {
      this.velocity.x *= 2;
      this.velocity.y *= 2;
    }

    // Remove document-level event listeners
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('touchmove', this.handleMouseMove);
    document.removeEventListener('touchend', this.handleMouseUp);
  };

  // Add method to fade in all textures
  private fadeInAllTextures() {
    this.textures.forEach((texture) => {
      texture.fadeTextureIn();
    });
  }

  private introSequence() {
    if (this.isIntroShown) return;

    // Now fade in the textures as part of the intro sequence
    this.fadeInAllTextures();

    this.TLIntro = new gsap.timeline({
      paused: false,
      onUpdate: () => {
        this.applyZoom(t.zoom);
      },
      onComplete: () => {
        this.isIntroShown = true;
        this.bindEvents();
      },
    });

    const t = { zoom: this.currentZoom };

    // Animate horizontal gap
    this.TLIntro.to(
      this,
      {
        ORIGINAL_HORIZONTAL_GAP: 90 * this.pixelRatio,
        duration: 1.2,
        ease: 'power3.out',
      },
      0
    );

    // Animate vertical gap
    this.TLIntro.to(
      this,
      {
        ORIGINAL_VERTICAL_GAP: 140 * this.pixelRatio,
        duration: 1.2,
        ease: 'power3.out',
      },
      0
    );

    // Animate zoom to 0.9
    this.TLIntro.to(
      t,
      {
        zoom: 0.9,
        duration: 1.2,
        ease: 'power3.out',
      },
      0
    );

    // Animate grayscale
    this.TLIntro.to(
      this,
      {
        grayscale: 0,
        duration: 1.2,
        ease: 'power3.out',
      },
      0
    );

    // Show zoom UI during animation
    this.TLIntro.call(
      () => {
        if (this.onIntroMostlyDone) {
          this.onIntroMostlyDone();
        }
      },
      null,
      0.0
    );
  }

  // Zoom function for UI controls
  public zoom(action: string) {
    if (!this.isIntroShown) return;

    const t = { zoom: this.currentZoom };
    let targetZoom =
      action === 'zoom-in'
        ? Math.round(this.currentZoom * 2 * 1000) / 1000
        : Math.round(this.currentZoom * 0.5 * 1000) / 1000;

    // Keep zoom within limits
    targetZoom = Math.max(0.25, targetZoom);

    gsap.to(t, {
      zoom: targetZoom,
      duration: 0.6,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.applyZoom(t.zoom);
      },
    });
  }

  // Apply zoom transformation
  private applyZoom(newZoom: number) {
    // Calculate zoom ratio
    const zoomRatio = newZoom / this.currentZoom;
    this.currentZoom = newZoom;

    // Update grid dimensions
    this.HORIZONTAL_GAP = this.ORIGINAL_HORIZONTAL_GAP * this.currentZoom;
    this.VERTICAL_GAP = this.ORIGINAL_VERTICAL_GAP * this.currentZoom;
    this.ITEM_WIDTH = this.ORIGINAL_ITEM_WIDTH * this.currentZoom;
    this.ITEM_HEIGHT = this.ORIGINAL_ITEM_HEIGHT * this.currentZoom;

    // Calculate anchor points for maintaining view center
    const anchorX =
      (this.imagesGL[0].textureObject.x - this.anchorLeft) * zoomRatio +
      this.anchorCenterLeft * zoomRatio;
    const anchorY =
      (this.imagesGL[0].textureObject.y - this.anchorTop) * zoomRatio +
      this.anchorCenterTop * zoomRatio;

    // Reposition grid items
    let row = -1;
    let x = 0;
    let y = 0;

    this.imagesGL.forEach((item, index) => {
      if (index % this.COLUMN_ITEM_LENGTH === 0) {
        row++;
        x = anchorX;
        y = anchorY + row * (this.ITEM_HEIGHT + this.VERTICAL_GAP);
      }

      item.updateSize(x, y, this.ITEM_WIDTH);
      x += this.ITEM_WIDTH + this.HORIZONTAL_GAP;
    });

    // Update grid boundaries
    const dimensions = this.getTotalDimensionsItems();
    this.centerCameraOffsetX = (dimensions.width - this.HORIZONTAL_GAP - this.windowSize.width) / 2;
    this.centerCameraOffsetY = (dimensions.height - this.VERTICAL_GAP - this.windowSize.height) / 2;

    // Apply updated boundaries to all items
    this.imagesGL.forEach((item) => {
      item.textureObject.x -= this.centerCameraOffsetX;
      item.textureObject.y -= this.centerCameraOffsetY;
      item.updateBounds(
        dimensions,
        this.ITEM_WIDTH + this.HORIZONTAL_GAP,
        this.ITEM_HEIGHT + this.VERTICAL_GAP,
        this.centerCameraOffsetX,
        this.centerCameraOffsetY
      );
    });

    // Store updated anchors
    this.anchorLeft = this.imagesGL[0].textureObject.x;
    this.anchorCenterLeft = anchorX;
    this.anchorTop = this.imagesGL[0].textureObject.y;
    this.anchorCenterTop = anchorY;
  }

  // FIXED: Update window size with better handling
  public setWindow() {
    // First, make sure canvas is sized correctly
    this.fixCanvasSize();

    const canvas = this.gl.canvas as HTMLCanvasElement;

    // Update stored window size with actual canvas dimensions
    this.windowSize = {
      width: canvas.width,
      height: canvas.height,
    };

    // Update scene dimensions for all grid items
    this.imagesGL.forEach((item) => {
      item.setWindow(this.windowSize);
    });

    // Get updated total dimensions
    const dimensions = this.getTotalDimensionsItems();

    // Calculate center offset - key to fixing positioning
    this.centerCameraOffsetX = (dimensions.width - this.HORIZONTAL_GAP - this.windowSize.width) / 2;
    this.centerCameraOffsetY = (dimensions.height - this.VERTICAL_GAP - this.windowSize.height) / 2;

    // Update all grid items with new boundaries
    this.imagesGL.forEach((item) => {
      item.updateBounds(
        dimensions,
        this.ITEM_WIDTH + this.HORIZONTAL_GAP,
        this.ITEM_HEIGHT + this.VERTICAL_GAP,
        this.centerCameraOffsetX,
        this.centerCameraOffsetY
      );
    });

    // Force a redraw
    this.render(0);
  }

  // Handle window resize
  public resize() {
    this.setWindow();
  }

  // Enhanced destroy method with proper cleanup
  public destroy() {
    // Prevent double destroy calls
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Stop rendering immediately (doesn't affect visuals)
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Clean up resize observer immediately (doesn't affect visuals)
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    } else {
      window.removeEventListener('resize', this.boundHandleResize);
    }

    // Remove event listeners immediately (doesn't affect visuals)
    this.unbindEvents();

    // Kill any GSAP animations (doesn't affect visuals)
    if (this.TLIntro) {
      this.TLIntro.kill();
    }
    if (this.introTimer) {
      this.introTimer.kill();
    }
    if (this.introMostlyDoneTimer) {
      this.introMostlyDoneTimer.kill();
    }

    // Schedule actual resource cleanup for AFTER all transitions complete
    setTimeout(() => {
      const { gl } = this;
      if (!gl) return; // Safety check

      try {
        // Cleanup textures
        if (this.textures) {
          this.textures.forEach((texture) => {
            if (texture && texture.destroy) {
              texture.destroy();
            }
          });
          this.textures = [];
        }

        if (this.texturesHD) {
          this.texturesHD.forEach((texture) => {
            if (texture && texture.destroy) {
              texture.destroy();
            }
          });
          this.texturesHD = [];
        }

        // Delete buffers
        if (this.positionBuffer) {
          gl.deleteBuffer(this.positionBuffer);
          this.positionBuffer = null;
        }

        if (this.texcoordBuffer) {
          gl.deleteBuffer(this.texcoordBuffer);
          this.texcoordBuffer = null;
        }

        // Delete shader program
        if (this.program) {
          gl.deleteProgram(this.program);
          this.program = null;
        }

        // Clear references to help GC
        this.imagesGL = [];

        // After cleanup, force context loss
        setTimeout(() => {
          try {
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
          } catch (e) {}
        }, 200);
      } catch (e) {}
    }, 800); // Delay until visual transitions are complete
  }

  // Canvas getter
  public get canvas() {
    return this.gl.canvas as HTMLCanvasElement;
  }
}
