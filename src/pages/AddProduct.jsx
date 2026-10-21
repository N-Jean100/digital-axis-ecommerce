import { useRef, useState } from 'react';
import axios from 'axios';
import { Icon } from './icons.jsx';

const emptyProduct = { name: '', description: '', price: '', category: '', stock: '', image: '', location: '' };
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'image/avif': ['.avif'],
};
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.avif,image/jpeg,image/png,image/webp,image/gif,image/avif';

function formatFileSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileType(file) {
  const mimeType = file.type.toLowerCase();
  if (ACCEPTED_IMAGE_TYPES[mimeType]) return mimeType;
  if (mimeType) return '';

  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  return Object.entries(ACCEPTED_IMAGE_TYPES).find(([, extensions]) => extensions.includes(extension))?.[0] || '';
}

function AddProduct({ onSuccess, onError }) {
  const [productData, setProductData] = useState(emptyProduct);
  const [imageMode, setImageMode] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [imageError, setImageError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const fileInputRef = useRef(null);
  const selectionId = useRef(0);

  const handleChange = (event) => setProductData((current) => ({ ...current, [event.target.name]: event.target.value }));

  const clearImage = () => {
    selectionId.current += 1;
    setProductData((current) => ({ ...current, image: '' }));
    setSelectedFile(null);
    setImageError('');
    setIsReading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const selectImageMode = (mode) => {
    if (mode === imageMode) return;
    clearImage();
    setImageMode(mode);
  };

  const readImageFile = (file) => {
    selectionId.current += 1;
    const currentSelection = selectionId.current;
    setImageError('');

    if (file.size === 0) {
      setImageError('That file is empty. Choose a non-empty image file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('This image is larger than 3 MiB. Choose a smaller file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (!getFileType(file)) {
      setImageError('Unsupported format. Choose a JPEG, PNG, WebP, GIF, or AVIF image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (selectionId.current !== currentSelection) return;
      if (typeof reader.result !== 'string') {
        setImageError('We couldn’t read that image. Please choose it again.');
        setIsReading(false);
        return;
      }

      setProductData((current) => ({ ...current, image: reader.result }));
      setSelectedFile({ name: file.name, size: file.size });
      setIsReading(false);
    };
    reader.onerror = () => {
      if (selectionId.current !== currentSelection) return;
      setImageError('We couldn’t read that image. Please choose it again.');
      setIsReading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 1) {
      selectionId.current += 1;
      setImageError('Choose one image file at a time.');
      event.target.value = '';
      return;
    }
    if (files[0]) readImageFile(files[0]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 1) {
      setImageError('Drop one image file at a time.');
      return;
    }
    if (files[0]) readImageFile(files[0]);
  };

  const handleImageUrlChange = (event) => {
    setSelectedFile(null);
    setImageError('');
    setProductData((current) => ({ ...current, image: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (isReading) {
      setImageError('Wait for the image preview to finish loading before saving.');
      return;
    }
    if (imageMode === 'url' && productData.image) {
      try {
        const imageUrl = new URL(productData.image);
        if (!['http:', 'https:'].includes(imageUrl.protocol) || imageUrl.username || imageUrl.password) {
          throw new Error('invalid URL');
        }
      } catch {
        setImageError('Enter a valid HTTP or HTTPS image URL.');
        return;
      }
    }
    setImageError('');

    const token = localStorage.getItem('token');
    if (!token) {
      const message = 'Nta token ibonetse! Banza winjire muri konti yawe nka Vendor.';
      setFormError(message);
      onError?.(message);
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post('http://localhost:5000/api/products/add', productData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProductData(emptyProduct);
      setImageMode('upload');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSuccess?.(response.data.product, response.data.message || 'Igicuruzwa cyongewe neza cyane!');
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Habaye ikibazo mu kongeramo igicuruzwa';
      setFormError(message);
      onError?.(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-5 sm:px-8">
        <div><h2 className="text-[15px] font-bold">Product details</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Fields marked required must be completed.</p></div>
        <span className="hidden items-center gap-2 rounded-full bg-[var(--mint)] px-3 py-1.5 text-[10px] font-semibold text-[var(--ink)] sm:flex"><span className="status-dot" /> Vendor tools</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
        {formError && <div className="rounded-xl border border-[#efd6ca] bg-[#fff8f4] px-4 py-3 text-[11px] leading-relaxed text-[#914a32] dark:bg-[#30231f]" role="alert">{formError}</div>}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="mb-2 block text-[11px] font-semibold">Izina ry'Igicuruzwa <span className="text-[#b34d2c]">*</span></span><input className="form-control rounded-xl px-3.5 py-3 text-[12px]" type="text" name="name" value={productData.name} onChange={handleChange} placeholder="e.g. Handwoven sisal tote" required /></label>
          <label className="block sm:col-span-2"><span className="mb-2 block text-[11px] font-semibold">Ibisobanuro (Description) <span className="text-[#b34d2c]">*</span></span><textarea className="form-control min-h-[108px] resize-y rounded-xl px-3.5 py-3 text-[12px] leading-relaxed" name="description" value={productData.description} onChange={handleChange} placeholder="Tell customers what makes this product worth discovering…" required /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-semibold">Igiciro (Price - RWF) <span className="text-[#b34d2c]">*</span></span><input className="form-control rounded-xl px-3.5 py-3 text-[12px]" type="number" name="price" min="0" step="any" value={productData.price} onChange={handleChange} placeholder="0" required /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-semibold">Icyiciro (Category) <span className="text-[#b34d2c]">*</span></span><input className="form-control rounded-xl px-3.5 py-3 text-[12px]" type="text" name="category" value={productData.category} onChange={handleChange} placeholder="e.g. Home, Accessories" required /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-semibold">Ingano ihari (Stock) <span className="text-[#b34d2c]">*</span></span><input className="form-control rounded-xl px-3.5 py-3 text-[12px]" type="number" name="stock" min="0" step="1" value={productData.stock} onChange={handleChange} placeholder="0" required /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-semibold">Location <span className="font-normal text-[var(--muted)]">· Optional</span></span><input className="form-control rounded-xl px-3.5 py-3 text-[12px]" type="text" name="location" value={productData.location} onChange={handleChange} maxLength={120} placeholder="e.g. Kigali, Rwanda" autoComplete="address-level2" /><span className="mt-1.5 block text-[10px] text-[var(--muted)]">Help customers find products near them.</span></label>

          <fieldset className="space-y-3 sm:col-span-2">
            <legend className="mb-2 text-[11px] font-semibold">Product image <span className="font-normal text-[var(--muted)]">· Optional</span></legend>
            <div className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--paper)] p-1" aria-label="Choose image source">
              <button type="button" aria-pressed={imageMode === 'upload'} onClick={() => selectImageMode('upload')} className={`rounded-lg px-3.5 py-2 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${imageMode === 'upload' ? 'bg-[var(--panel)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>Upload a file</button>
              <button type="button" aria-pressed={imageMode === 'url'} onClick={() => selectImageMode('url')} className={`rounded-lg px-3.5 py-2 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${imageMode === 'url' ? 'bg-[var(--panel)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>Use an image URL</button>
            </div>

            {imageMode === 'upload' ? (
              <div
                className={`rounded-2xl border border-dashed px-4 py-6 transition-colors motion-reduce:transition-none sm:px-6 ${isDragging ? 'border-[#91b846] bg-[var(--mint)]' : 'border-[#cbd5c8] bg-[var(--paper)]'}`}
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
                onDrop={handleDrop}
                aria-label="Drop an image file here or browse your device"
              >
                <input ref={fileInputRef} className="sr-only" type="file" accept={IMAGE_ACCEPT} onChange={handleFileChange} aria-label="Choose a product image file" />
                {productData.image ? (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <img src={productData.image} alt={selectedFile ? `Preview of ${selectedFile.name}` : 'Product image preview'} className="h-24 w-24 shrink-0 rounded-xl border border-[var(--line)] bg-[var(--panel)] object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold">{selectedFile?.name || 'Image preview'}</p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">{selectedFile ? formatFileSize(selectedFile.size) : 'Image ready to use'}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[10px] font-semibold transition hover:border-[#a7ba8d] focus-visible:outline-offset-2">Change image</button>
                        <button type="button" onClick={clearImage} className="rounded-lg px-3 py-2 text-[10px] font-semibold text-[var(--muted)] transition hover:text-[#a45438] focus-visible:outline-offset-2">Remove</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[var(--mint)] text-[#657d45]"><Icon name="box" size={19} /></div>
                    <p className="text-[12px] font-semibold">{isDragging ? 'Drop your image to add it' : 'Drag and drop an image here'}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">or browse your device</p>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="primary-action-button mt-4 rounded-lg px-4 py-2.5 text-[10px] font-semibold transition hover:opacity-85 focus-visible:outline-offset-2">Browse files</button>
                    <p className="mt-3 text-[10px] text-[var(--muted)]">JPEG, PNG, WebP, GIF or AVIF · Up to 3 MiB</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor="product-image-url" className="mb-2 block text-[11px] font-semibold">Link y'Ifoto (Image URL)</label>
                <input id="product-image-url" className="form-control rounded-xl px-3.5 py-3 text-[12px]" type="url" name="image" value={productData.image} onChange={handleImageUrlChange} placeholder="https://…" autoComplete="url" />
                <span className="mt-1.5 block text-[10px] text-[var(--muted)]">Use a public HTTP or HTTPS image link. Choosing a URL replaces any uploaded image.</span>
                {productData.image && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3">
                    <img src={productData.image} alt="Product image preview" className="h-16 w-16 shrink-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] object-cover" />
                    <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold">URL preview</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{productData.image}</p></div>
                    <button type="button" onClick={clearImage} className="rounded-lg px-2 py-2 text-[10px] font-semibold text-[var(--muted)] hover:text-[#a45438] focus-visible:outline-offset-2">Remove</button>
                  </div>
                )}
              </div>
            )}
            {imageError && <p className="text-[11px] font-medium text-[#a45438]" role="alert">{imageError}</p>}
            <p className="text-[10px] leading-relaxed text-[var(--muted)]" aria-live="polite">{isReading ? 'Preparing image preview…' : 'Choose one image source. Uploads are stored with the product and are limited to 3 MiB.'}</p>
          </fieldset>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-5">
          <p className="max-w-[340px] text-[10px] leading-relaxed text-[var(--muted)]">Only add product images you’re allowed to publish.</p>
          <button type="submit" disabled={submitting || isReading} className="primary-action-button inline-flex min-w-[168px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-[11px] font-semibold transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b7ef5e] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none">
            {submitting ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" /> Saving…</> : <><Icon name="plus" size={15} /> Ongeramo Igicuruzwa</>}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AddProduct;
