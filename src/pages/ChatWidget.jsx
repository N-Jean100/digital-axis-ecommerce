import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_URL, getApiErrorMessage } from './api.js';
import { Icon } from './icons.jsx';
import './chat-widget.css';

const suggestions = ['Show me accessories', 'Find products in Kigali', 'What is under 10,000 RWF?'];

function ProductSuggestion({ product }) {
  return (
    <article className="chat-product">
      {product.image ? (
        <img src={product.image} alt="" className="chat-product-image" />
      ) : (
        <div className="chat-product-placeholder" aria-hidden="true"><Icon name="box" size={17} /></div>
      )}
      <div className="chat-product-copy">
        <p className="chat-product-name">{product.name}</p>
        <p className="chat-product-meta">
          {Number(product.price).toLocaleString()} RWF
          {product.location ? ` · ${product.location}` : ''}
        </p>
        {product.category && <span className="chat-product-category">{product.category}</span>}
      </div>
    </article>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi! I can help you discover products in the DIGITAL Axis catalog. Ask about an item, category, budget, or location.'
    }
  ]);
  const transcriptRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [messages, open, sending]);

  const sendMessage = async (event, suggestion) => {
    event?.preventDefault();
    const text = (suggestion || draft).trim();
    if (!text || sending || text.length > 500) return;

    setDraft('');
    setSending(true);
    setMessages((current) => [...current, { id: `${Date.now()}-user`, role: 'user', text }]);

    try {
      const response = await axios.post(`${API_URL}/chat`, { message: text });
      setMessages((current) => [...current, {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        text: response.data.reply,
        products: Array.isArray(response.data.products) ? response.data.products : []
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: `${Date.now()}-error`,
        role: 'assistant',
        text: getApiErrorMessage(error, 'The product assistant is unavailable right now. Please try again.'),
        isError: true
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="product-chat-widget">
      {open && (
        <section className="product-chat-panel" aria-label="DIGITAL Axis product assistant">
          <header className="product-chat-header">
            <div className="product-chat-avatar"><Icon name="sparkle" size={17} /></div>
            <div className="min-w-0 flex-1">
              <h2>Axis assistant</h2>
              <p><span className="product-chat-online" /> Here to help you discover</p>
            </div>
            <button type="button" className="product-chat-close" aria-label="Close product assistant" onClick={() => setOpen(false)}>
              <Icon name="close" size={17} />
            </button>
          </header>

          <div className="product-chat-transcript" ref={transcriptRef} role="log" aria-live="polite" aria-relevant="additions text">
            <div className="product-chat-day">CATALOG DISCOVERY</div>
            {messages.map((message) => (
              <div className={`product-chat-message-row ${message.role === 'user' ? 'is-user' : ''}`} key={message.id}>
                <div className={`product-chat-message ${message.role === 'user' ? 'is-user' : ''} ${message.isError ? 'is-error' : ''}`}>
                  <p>{message.text}</p>
                  {message.products?.length > 0 && (
                    <div className="chat-product-list">
                      {message.products.map((product) => <ProductSuggestion product={product} key={product._id} />)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="product-chat-suggestions" aria-label="Suggested questions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" disabled={sending} onClick={(event) => sendMessage(event, suggestion)}>{suggestion}</button>
                ))}
              </div>
            )}
            {sending && <div className="product-chat-typing" aria-label="Assistant is searching the catalog"><span /><span /><span /></div>}
          </div>

          <form className="product-chat-compose" onSubmit={sendMessage}>
            <label className="sr-only" htmlFor="product-chat-input">Ask about products</label>
            <textarea
              id="product-chat-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about products…"
              maxLength={500}
              rows={1}
              disabled={sending}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(event);
                }
              }}
            />
            <button type="submit" aria-label="Send message" disabled={sending || !draft.trim()}>
              <Icon name="arrow" size={17} />
            </button>
            <span className="product-chat-hint">Catalog answers · {draft.length}/500</span>
          </form>
        </section>
      )}
      <button
        type="button"
        className={`product-chat-launcher ${open ? 'is-open' : ''}`}
        aria-label={open ? 'Close product assistant' : 'Chat with the product assistant'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <Icon name="close" size={20} /> : <><Icon name="sparkle" size={19} /><span>Ask Axis</span></>}
      </button>
    </div>
  );
}
