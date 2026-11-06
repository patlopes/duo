const MAX_SIDE = 1600;

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.7));
}

/**
 * Receipts are shrunk before saving because they live in the phone's limited storage. Safari cannot
 * encode WebP and silently returns a huge PNG instead, so that case falls back to JPEG.
 */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await toBlob(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  return (await toBlob(canvas, 'image/jpeg')) ?? file;
}
