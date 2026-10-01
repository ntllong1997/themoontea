// Shrinks a photo in the browser before it is uploaded, so a 4000px phone
// photo becomes a ~1200px file of a few hundred KB.

const MAX_EDGE = 1200;

const toBlob = (canvas, type, quality) =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/** @param {File} file @returns {Promise<Blob>} a WebP (or JPEG) no larger than MAX_EDGE */
export async function resizePhoto(file) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        throw new Error('That photo could not be opened. Try a JPG or PNG.');
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    // Transparent PNGs land on white, which the menu blends into its cream.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    // Older Safari can't encode WebP and quietly hands back a PNG instead.
    const webp = await toBlob(canvas, 'image/webp', 0.85);
    if (webp?.type === 'image/webp') return webp;
    return toBlob(canvas, 'image/jpeg', 0.88);
}
