/**
 * Image compression utilities
 */

export async function compressImage(file: File, maxDimension = 1024, quality = 0.6): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions
                if (width > height) {
                    if (width > maxDimension) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    }
                } else {
                    if (height > maxDimension) {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Convert to JPEG base64 (removes transparency but optimal for photos)
                // If we need transparency, we could check file.type
                const outputFormat = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
                // Note: JPEG is much smaller for photos.
                // Forcing JPEG for robustness on photos (often large).
                // However, let's stick to JPEG for compression efficiency unless user needs PNG.
                // Given "iPhone photos", JPEG is best.

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}
