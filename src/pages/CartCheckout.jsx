import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Icon } from './icons.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function authConfig() {
  return { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } };
}

function formatRwf(amount) {
  return `${Number(amount).toLocaleString()} RWF`;
}

function statusLabel(status) {
  return {
    pending: 'Awaiting payment confirmation',
    paid: 'Payment confirmed',
    failed: 'Payment or stock confirmation failed',
    cancelled: 'Payment cancelled'
  }[status] || status;
}

function OrderStatus({ order, onRefresh, refreshing }) {
  if (!order) return null;
  const inventoryFailure = order.failureCode === 'INVENTORY_UNAVAILABLE_AFTER_PAYMENT';
  return (
    <section className="mb-7 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--muted)]">Order {String(order._id).slice(-8)}</p>
          <h2 className="mt-2 text-[16px] font-bold">{statusLabel(order.paymentStatus)}</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {order.paymentStatus === 'pending'
              ? 'This order is not paid yet. Only confirmation from the payment provider can change its status.'
              : inventoryFailure
                ? 'The provider confirmed payment, but stock could not be reserved. Contact support promptly about a refund.'
                : order.paymentStatus === 'paid'
                  ? 'The provider confirmed payment and the ordered stock has been reserved.'
                  : 'No successful payment is recorded for this order.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-bold">{formatRwf(order.total)}</span>
          {order.paymentStatus === 'pending' && (
            <button type="button" className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11px] font-semibold hover:bg-[var(--panel-raised)] disabled:opacity-50" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Checking…' : 'Check status'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function CartCheckout({ cartItems, products, onQuantityChange, onRemove, onClear, onBrowse }) {
  const [paymentProvider, setPaymentProvider] = useState('mtn');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/checkout/orders`, authConfig());
      const recentOrders = Array.isArray(response.data?.orders) ? response.data.orders : [];
      setOrders(recentOrders);
      return recentOrders;
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Your previous orders could not be loaded.');
      return [];
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const refreshOrder = useCallback(async (orderId, manual = false) => {
    if (!orderId) return;
    if (manual) setRefreshing(true);
    try {
      const response = await axios.get(`${API_URL}/checkout/orders/${encodeURIComponent(orderId)}`, authConfig());
      const order = response.data?.order;
      if (order) {
        setCurrentOrder(order);
        setOrders((current) => [order, ...current.filter((item) => item._id !== order._id)]);
      }
      setError('');
    } catch (refreshError) {
      setError(refreshError.response?.data?.message || 'Payment status is temporarily unavailable. Your order has not been marked paid.');
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders().then((recentOrders) => {
      const params = new URLSearchParams(window.location.search);
      const orderId = params.get('order');
      if (orderId) {
        refreshOrder(orderId);
        const checkoutState = params.get('checkout');
        if (checkoutState === 'cancelled') {
          setNotice('Checkout was closed. The order remains pending until the provider reports an authoritative status.');
        } else if (checkoutState === 'complete') {
          setNotice('You returned from hosted checkout. Payment is not considered complete until the signed provider event is confirmed.');
        }
        params.delete('checkout');
        params.delete('order');
        const query = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
      } else if (recentOrders[0]) {
        setCurrentOrder(recentOrders[0]);
      }
    });
  }, [loadOrders, refreshOrder]);

  useEffect(() => {
    if (!currentOrder || currentOrder.paymentStatus !== 'pending') return undefined;
    const timer = window.setInterval(() => refreshOrder(currentOrder._id), 6000);
    return () => window.clearInterval(timer);
  }, [currentOrder, refreshOrder]);

  const cartProducts = cartItems.map((item) => ({
    ...item,
    product: products.find((product) => product._id === item.productId)
  }));
  const unavailableItems = cartProducts.filter(({ product, quantity }) => !product || Number(product.stock) < quantity);

  async function submitOrder(event) {
    event.preventDefault();
    if (!cartItems.length) return;
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const payload = {
        items: cartItems.map(({ productId, quantity }) => ({ productId, quantity })),
        paymentProvider,
        ...(paymentProvider === 'mtn' ? { phone } : {})
      };
      const response = await axios.post(`${API_URL}/checkout/orders`, payload, authConfig());
      const order = response.data?.order;
      if (!order?._id) throw new Error('The server did not return an order. Please check your orders before retrying.');
      setCurrentOrder(order);
      setOrders((current) => [order, ...current.filter((item) => item._id !== order._id)]);
      onClear();
      if (response.data.checkoutUrl) {
        window.location.assign(response.data.checkoutUrl);
        return;
      }
      setNotice(response.data.message || 'Payment is pending provider confirmation. Approve the request on your phone; this page will refresh the status.');
    } catch (submitError) {
      setError(submitError.response?.data?.message || submitError.message || 'The order could not be started. Your cart is unchanged.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="checkout-heading">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[var(--muted)]">Customer checkout</p>
          <h1 id="checkout-heading" className="text-[clamp(27px,4vw,36px)] font-semibold tracking-[-.045em]">Your cart</h1>
          <p className="mt-2 text-[12px] text-[var(--muted)]">Current prices and available stock are rechecked by the server when you place the order.</p>
        </div>
        <button type="button" className="rounded-xl border border-[var(--line)] px-4 py-3 text-[11px] font-semibold hover:bg-[var(--panel-raised)]" onClick={onBrowse}>Continue browsing</button>
      </div>

      {currentOrder && <OrderStatus order={currentOrder} onRefresh={() => refreshOrder(currentOrder._id, true)} refreshing={refreshing} />}
      {notice && <p className="mb-5 rounded-xl border border-[#8dbd36]/30 bg-[var(--mint)] px-4 py-3 text-[11px] leading-relaxed" role="status">{notice}</p>}
      {error && <p className="mb-5 rounded-xl border border-[#8a4b3b] bg-[#3a2525] px-4 py-3 text-[11px] leading-relaxed text-[#ffd3c3]" role="alert">{error}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(290px,.8fr)]">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div><h2 className="text-[14px] font-bold">Items to purchase</h2><p className="mt-1 text-[10px] text-[var(--muted)]">{cartItems.length} {cartItems.length === 1 ? 'product' : 'products'}</p></div>
            {cartItems.length > 0 && <button type="button" onClick={onClear} className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]">Clear cart</button>}
          </div>
          {cartProducts.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--mint)]"><Icon name="box" size={20} /></div>
              <h3 className="text-[14px] font-bold">Your cart is empty</h3>
              <p className="mt-2 text-[11px] text-[var(--muted)]">Add items from the catalog to start a secure checkout.</p>
              <button type="button" className="primary-action-button mt-5 rounded-lg px-4 py-2.5 text-[11px] font-bold" onClick={onBrowse}>Browse products</button>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {cartProducts.map(({ productId, quantity, product }) => (
                <li key={productId} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--panel-raised)]">
                    {product?.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : <Icon name="box" size={19} />}
                  </div>
                  <div className="min-w-[120px] flex-1">
                    <p className="text-[12px] font-bold">{product?.name || 'Product no longer available'}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">{product ? `${formatRwf(product.price)} each · ${product.stock} in stock` : 'Remove this item before checkout.'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={`Decrease ${product?.name || 'item'} quantity`} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] hover:bg-[var(--panel-raised)]" onClick={() => onQuantityChange(productId, quantity - 1)}>−</button>
                    <span className="min-w-6 text-center text-[12px] font-semibold">{quantity}</span>
                    <button type="button" aria-label={`Increase ${product?.name || 'item'} quantity`} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] hover:bg-[var(--panel-raised)] disabled:opacity-40" disabled={!product || quantity >= Math.min(10, Number(product.stock))} onClick={() => onQuantityChange(productId, quantity + 1)}>+</button>
                    <button type="button" aria-label={`Remove ${product?.name || 'item'} from cart`} className="ml-1 text-[10px] font-semibold text-[var(--muted)] hover:text-[#e99a80]" onClick={() => onRemove(productId)}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5" onSubmit={submitOrder}>
          <h2 className="text-[14px] font-bold">Payment method</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">Your server verifies current prices and creates the payable total. Card details stay on Stripe-hosted Checkout.</p>
          <fieldset className="mt-5 space-y-2">
            <legend className="sr-only">Choose a payment provider</legend>
            {[{ id: 'mtn', title: 'MTN Mobile Money', description: 'Approve the request on your Rwandan mobile.' }, { id: 'stripe', title: 'Card · Stripe Checkout', description: 'Continue to Stripe’s secure hosted payment page.' }].map((method) => (
              <label key={method.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${paymentProvider === method.id ? 'border-[#a3e635]/60 bg-[var(--mint)]' : 'border-[var(--line)] hover:border-[#66758a]'}`}>
                <input type="radio" name="paymentProvider" value={method.id} checked={paymentProvider === method.id} onChange={() => setPaymentProvider(method.id)} className="mt-1 accent-[#a3e635]" />
                <span><span className="block text-[11px] font-bold">{method.title}</span><span className="mt-1 block text-[10px] leading-relaxed text-[var(--muted)]">{method.description}</span></span>
              </label>
            ))}
          </fieldset>
          {paymentProvider === 'mtn' && (
            <label className="mt-4 block">
              <span className="mb-2 block text-[11px] font-semibold">Rwanda mobile number</span>
              <input className="form-control rounded-xl px-3 py-3 text-[12px]" type="tel" inputMode="tel" autoComplete="tel" placeholder="078 123 4567" value={phone} onChange={(event) => setPhone(event.target.value)} required />
              <span className="mt-1 block text-[10px] text-[var(--muted)]">The number is sent only to MTN to initiate the payment; it is not stored in the order.</span>
            </label>
          )}
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <p className="text-[10px] leading-relaxed text-[var(--muted)]">The final amount appears after the server has verified inventory and will be shown before payment on the provider page or order status.</p>
            <button type="submit" disabled={!cartItems.length || submitting || unavailableItems.length > 0} className="primary-action-button mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[12px] font-bold">
              {submitting ? 'Starting secure checkout…' : paymentProvider === 'stripe' ? 'Continue to Stripe' : 'Request Mobile Money payment'}
            </button>
            {unavailableItems.length > 0 && <p className="mt-2 text-[10px] text-[#e99a80]" role="alert">Reduce the quantity or remove items with insufficient stock before checkout.</p>}
          </div>
        </form>
      </div>

      <section className="mt-9" aria-labelledby="order-history-heading">
        <div className="mb-3 flex items-end justify-between"><h2 id="order-history-heading" className="text-[14px] font-bold">Recent orders</h2><span className="text-[10px] text-[var(--muted)]">Provider-confirmed status</span></div>
        {loadingOrders ? <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-[11px] text-[var(--muted)]">Loading your orders…</p> : orders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] p-5 text-[11px] text-[var(--muted)]">No orders yet. Submitted orders will appear here.</p>
        ) : (
          <div className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            {orders.slice(0, 5).map((order) => (
              <button type="button" key={order._id} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-[var(--panel-raised)]" onClick={() => { setCurrentOrder(order); refreshOrder(order._id); }}>
                <span><span className="block text-[11px] font-semibold">Order {String(order._id).slice(-8)} · {new Date(order.createdAt).toLocaleDateString()}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{statusLabel(order.paymentStatus)}</span></span>
                <span className="shrink-0 text-[11px] font-bold">{formatRwf(order.total)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
