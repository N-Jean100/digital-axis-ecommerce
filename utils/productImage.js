const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/]*={0,2})$/i;

function hasImageSignature(mimeType, data) {
  if (mimeType === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === 'image/png') return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/gif') return data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6));
  if (mimeType === 'image/webp') return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (mimeType === 'image/avif') return data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(data.toString('ascii', 8, 12));
  return false;
}

function validateProductImage(image) {
  if (image === undefined || image === null || image === '') return null;
  if (typeof image !== 'string') return 'Image must be a URL or a supported image data URL.';
  if (image.length > 5 * 1024 * 1024) return 'Image data is too large. Local images must be 3 MiB or smaller.';

  if (image.startsWith('data:')) {
    const match = IMAGE_DATA_URL.exec(image);
    if (!match) return 'Image data must be a base64 JPEG, PNG, WebP, GIF, or AVIF image.';

    const [, declaredType, encoded] = match;
    if (!encoded || encoded.length % 4 !== 0) return 'Image data is empty or malformed.';
    const data = Buffer.from(encoded, 'base64');
    if (!data.length || data.length > MAX_IMAGE_BYTES) return 'Image data must be non-empty and no larger than 3 MiB.';
    if (data.toString('base64') !== encoded) return 'Image data is malformed.';
    if (!hasImageSignature(declaredType.toLowerCase(), data)) return 'Image content does not match its declared image format.';
    return null;
  }

  if (image.length > 2048) return 'Image URL is too long.';
  if (/[\u0000-\u0020\u007f]/.test(image)) return 'Image URL contains invalid characters.';
  try {
    const url = new URL(image);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      return 'Image URL must be a valid HTTP or HTTPS URL without embedded credentials.';
    }
  } catch {
    return 'Image URL must be a valid HTTP or HTTPS URL.';
  }
  return null;
}

module.exports = { MAX_IMAGE_BYTES, validateProductImage };
