import { Icon } from './icons.jsx';

function ProductCard({ product, index, onContactSeller, canMessageSeller, onAddToCart, canPurchase }) {
  return (
    <article className="product-card overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <div className="image-stage relative grid h-[176px] place-items-center overflow-hidden">
        {product.image ? (
          <img src={product.image} alt={product.name || 'Product'} className="absolute inset-0 h-full w-full object-cover" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/70 bg-white/50 text-[#789057] shadow-sm"><Icon name="box" size={25} /></div>
        )}
        <span className="absolute left-3 top-3 max-w-[70%] truncate rounded-lg border border-[var(--line)] bg-[var(--panel)]/90 px-2.5 py-1 text-[9px] font-semibold text-[var(--muted)]">{product.category || 'Uncategorized'}</span>
      </div>
      <div className="product-copy p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-[14px] font-bold tracking-[-.02em]" title={product.name}>{product.name || 'Unnamed product'}</h3>
          <span className="shrink-0 text-[12px] font-bold">{Number.isFinite(Number(product.price)) ? `${Number(product.price).toLocaleString()} RWF` : '—'}</span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-8 text-[11px] leading-relaxed text-[var(--muted)]">{product.description || 'No description provided.'}</p>
        <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3 text-[10px]">
          <span className="text-[var(--muted)]">Available stock</span>
          <span className={`font-semibold ${Number(product.stock) <= 0 ? 'text-[#a45438]' : 'text-[var(--ink)]'}`}>{Number.isFinite(Number(product.stock)) ? Number(product.stock).toLocaleString() : '—'}</span>
        </div>
        {product.location && <p className="mt-2 text-[10px] text-[var(--muted)]">Available in {product.location}</p>}
        {canPurchase && (
          <button
            type="button"
            onClick={() => onAddToCart(product)}
            disabled={Number(product.stock) < 1}
            className="primary-action-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[11px] font-semibold transition hover:-translate-y-0.5 disabled:translate-y-0"
          >
            <Icon name="plus" size={14} /> {Number(product.stock) < 1 ? 'Out of stock' : 'Add to cart'}
          </button>
        )}
        {canMessageSeller && product.vendor?._id && (
          <button
            type="button"
            onClick={() => onContactSeller(product)}
            className="primary-action-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[11px] font-semibold transition hover:-translate-y-0.5"
          >
            <Icon name="users" size={14} /> Message seller
          </button>
        )}
      </div>
    </article>
  );
}

function ProductList({ products = [], loading, error, onRetry, onAddProduct, onAddToCart, onContactSeller, userRole, query, onQueryChange, category, onCategoryChange, categories = [], title, subtitle, showFilters }) {
  return (
    <section aria-labelledby="product-list-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><h2 id="product-list-title" className="text-[17px] font-bold tracking-[-.035em]">{title}</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{subtitle}</p></div>
        <span className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[10px] font-semibold text-[var(--muted)]">{loading ? 'Loading catalog…' : `${products.length} ${products.length === 1 ? 'item' : 'items'}`}</span>
      </div>
      {showFilters && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search products</span><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"><Icon name="search" size={16} /></span>
            <input type="search" className="form-control rounded-xl py-3 pl-10 pr-4 text-[12px]" placeholder="Search name, details, category…" value={query} onChange={(event) => onQueryChange(event.target.value)} />
          </label>
          <label className="relative sm:w-[190px]">
            <span className="sr-only">Filter by category</span>
            <select className="form-control h-full min-h-[44px] rounded-xl px-3 text-[12px]" value={category} onChange={(event) => onCategoryChange(event.target.value)}>
              <option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-[#efd6ca] bg-[#fff8f4] p-7 text-center dark:border-[#684337] dark:bg-[#30231f]">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[#fbe9df] text-[#a45438]"><Icon name="box" /></div>
          <h3 className="text-[14px] font-bold">We couldn’t reach your catalog</h3>
          <p className="mx-auto mt-2 max-w-[460px] break-words text-[11px] leading-relaxed text-[var(--muted)]">{error}</p>
          <button onClick={onRetry} className="primary-action-button mt-5 rounded-lg px-4 py-2.5 text-[11px] font-semibold transition hover:opacity-85">Try again</button>
        </div>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]"><div className="image-stage h-[176px] animate-pulse" /><div className="space-y-3 p-4"><div className="h-3 w-3/5 animate-pulse rounded bg-[var(--line)]" /><div className="h-2.5 w-full animate-pulse rounded bg-[var(--line)]" /><div className="h-2.5 w-4/5 animate-pulse rounded bg-[var(--line)]" /></div></div>)}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#cbd5c8] bg-[var(--panel)] px-6 py-12 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)] text-[#657d45]"><Icon name={query || category !== 'all' ? 'search' : 'box'} size={22} /></div>
          <h3 className="text-[14px] font-bold">{query || category !== 'all' ? 'No matching products' : 'Your catalog is ready for its first product'}</h3>
          <p className="mx-auto mt-2 max-w-[380px] text-[11px] leading-relaxed text-[var(--muted)]">{query || category !== 'all' ? 'Try a different search term or category filter.' : 'There are no products in the catalog yet. Add a real item to see it appear here.'}</p>
          {!query && category === 'all' && onAddProduct && <button onClick={onAddProduct} className="primary-action-button mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[11px] font-semibold transition hover:-translate-y-0.5"><Icon name="plus" size={14} /> Add your first product</button>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product, index) => <div className="reveal" key={product._id || `${product.name}-${index}`}><ProductCard product={product} index={index} canMessageSeller={userRole === 'customer'} canPurchase={userRole === 'customer'} onAddToCart={onAddToCart} onContactSeller={onContactSeller} /></div>)}
        </div>
      )}
    </section>
  );
}

export default ProductList;
