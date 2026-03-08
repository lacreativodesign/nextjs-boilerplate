export const MAX_IMAGE_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export type ImageMetadata = {
  width: number;
  height: number;
  format: string;
  originalSize: number;
  optimizedSize: number;
};

export type OptimizedImageUpload = {
  file: File;
  thumbnail: File;
  metadata: ImageMetadata;
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

function getOutputFormat(mimeType: string) {
  if (mimeType === "image/png") return "image/png";
  return "image/webp";
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof window === "undefined") {
    throw new Error("Image optimization is only supported in the browser.");
  }

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Unable to decode image."));
    element.src = url;
  });

  return {
    source: image,
    width: image.width,
    height: image.height,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

async function renderImageFile(params: {
  image: DecodedImage;
  maxWidth: number;
  maxHeight: number;
  mimeType: string;
  quality: number;
  fileName: string;
}) {
  const { image, maxWidth, maxHeight, mimeType, quality, fileName } = params;
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: mimeType !== "image/jpeg" });
  if (!context) throw new Error("Unable to initialize canvas context.");

  context.drawImage(image.source, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) return reject(new Error("Image conversion failed."));
      resolve(result);
    }, mimeType, quality);
  });

  return new File([blob], fileName, { type: mimeType, lastModified: Date.now() });
}

export async function optimizeImageForUpload(file: File): Promise<OptimizedImageUpload> {
  if (!file.type.startsWith("image/")) throw new Error("Selected file is not an image.");
  if (file.size > MAX_IMAGE_UPLOAD_SIZE_BYTES) throw new Error("Image exceeds 5MB upload limit.");

  const decoded = await decodeImage(file);
  const outputMimeType = getOutputFormat(file.type);
  const extension = outputMimeType === "image/png" ? "png" : "webp";
  const baseName = file.name.replace(/\.[^.]+$/, "");

  try {
    const optimized = await renderImageFile({
      image: decoded,
      maxWidth: 1920,
      maxHeight: 1920,
      mimeType: outputMimeType,
      quality: 0.82,
      fileName: `${baseName}.${extension}`,
    });

    const thumbnail = await renderImageFile({
      image: decoded,
      maxWidth: 320,
      maxHeight: 320,
      mimeType: outputMimeType,
      quality: 0.72,
      fileName: `${baseName}.thumb.${extension}`,
    });

    return {
      file: optimized,
      thumbnail,
      metadata: {
        width: decoded.width,
        height: decoded.height,
        format: outputMimeType,
        originalSize: file.size,
        optimizedSize: optimized.size,
      },
    };
  } finally {
    decoded.cleanup();
  }
}
