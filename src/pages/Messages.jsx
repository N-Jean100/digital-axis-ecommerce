import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Icon } from './icons.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const MESSAGE_URL = `${API_URL}/messages`;
const REALTIME_URL = API_URL.replace(/\/api\/?$/, '');
const VOICE_NOTE_LIMIT_SECONDS = 120;

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || error.message || fallback;
}

function requestConfig() {
  const token = localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
}

function VoiceNote({ message }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    axios.get(`${MESSAGE_URL}/messages/${message._id}/voice-note`, {
      ...requestConfig(),
      responseType: 'blob'
    }).then((response) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(response.data);
      setAudioUrl(objectUrl);
    }).catch((requestError) => {
      if (!cancelled) setError(getErrorMessage(requestError, 'Could not load voice note.'));
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message._id]);

  if (error) return <span className="text-[11px] text-[#a45438]">{error}</span>;
  if (!audioUrl) return <span className="text-[11px] text-[var(--muted)]">Loading voice note…</span>;
  return <audio controls preload="none" src={audioUrl} className="max-w-full" aria-label="Voice note" />;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Messages({ user, startRequest }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const lastStartRequestRef = useRef('');
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localCallStreamRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const callRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [call, setCall] = useState(null);
  const [localCallStream, setLocalCallStream] = useState(null);
  const [remoteCallStream, setRemoteCallStream] = useState(null);
  const activeConversation = conversations.find((conversation) => conversation._id === activeConversationId);

  const updateCall = useCallback((value) => {
    if (typeof value === 'function') value = value(callRef.current);
    callRef.current = value;
    setCall(value);
  }, []);

  const finishCall = useCallback((notifyPeer = false) => {
    const activeCall = callRef.current;
    if (notifyPeer && activeCall) {
      socketRef.current?.emit('call:end', {
        conversationId: activeCall.conversationId,
        callId: activeCall.callId
      });
    }
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localCallStreamRef.current?.getTracks().forEach((track) => track.stop());
    localCallStreamRef.current = null;
    pendingIceCandidatesRef.current = [];
    setLocalCallStream(null);
    setRemoteCallStream(null);
    updateCall(null);
  }, [updateCall]);

  const loadConversations = useCallback(async () => {
    const response = await axios.get(`${MESSAGE_URL}/conversations`, requestConfig());
    setConversations(response.data);
    return response.data;
  }, []);

  const loadMessages = useCallback(async (conversationId, showLoading = true) => {
    if (!conversationId) return;
    if (showLoading) setLoadingMessages(true);
    try {
      const response = await axios.get(`${MESSAGE_URL}/conversations/${conversationId}/messages`, requestConfig());
      setMessages(response.data);
    } catch (requestError) {
      if (showLoading) setError(getErrorMessage(requestError, 'Could not load this conversation.'));
    } finally {
      if (showLoading) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadConversations()
      .then((items) => {
        if (!cancelled && items.length) setActiveConversationId((current) => current || items[0]._id);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, 'Could not load your conversations.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false);
      });
    return () => { cancelled = true; };
  }, [loadConversations]);

  useEffect(() => {
    if (!startRequest || startRequest.id === lastStartRequestRef.current) return;
    lastStartRequestRef.current = startRequest.id;
    let cancelled = false;
    setError('');
    axios.post(`${MESSAGE_URL}/conversations`, { productId: startRequest.productId }, requestConfig())
      .then(async (response) => {
        const conversationId = response.data.conversation._id;
        if (cancelled) return;
        setActiveConversationId(conversationId);
        await loadConversations();
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, 'Could not start a conversation with this seller.'));
      });
    return () => { cancelled = true; };
  }, [startRequest, loadConversations]);

  useEffect(() => {
    setMessages([]);
    setError('');
    loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    if (!activeConversationId) return undefined;
    const timer = window.setInterval(() => {
      loadMessages(activeConversationId, false);
      loadConversations().catch((requestError) => {
        setError(getErrorMessage(requestError, 'Could not refresh your conversations.'));
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeConversationId, loadConversations, loadMessages]);

  useEffect(() => {
    if (!activeConversationId) return undefined;
    const token = localStorage.getItem('token');
    if (!token) return undefined;

    const socket = io(REALTIME_URL, {
      auth: { token, name: user.name },
      reconnection: true
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('conversation:join', { conversationId: activeConversationId }, (result) => {
        if (!result?.ok && result?.message) setError(result.message);
      });
    });
    socket.on('connect_error', (socketError) => {
      setError(socketError.message || 'Could not connect to video calling.');
    });
    socket.on('disconnect', () => {
      if (callRef.current?.conversationId === activeConversationId) finishCall(false);
    });
    socket.on('call:incoming', (incomingCall) => {
      if (callRef.current) {
        socket.emit('call:reject', incomingCall);
        return;
      }
      updateCall({ ...incomingCall, status: 'incoming', initiator: false });
    });
    socket.on('call:accept', async ({ callId }) => {
      const activeCall = callRef.current;
      if (!activeCall?.initiator || activeCall.callId !== callId) return;
      try {
        const iceResponse = await axios.get(`${MESSAGE_URL}/ice-config`, requestConfig());
        const peer = new RTCPeerConnection({ iceServers: iceResponse.data.iceServers });
        peerConnectionRef.current = peer;
        localCallStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localCallStreamRef.current));
        peer.onicecandidate = ({ candidate }) => {
          if (candidate) socket.emit('call:signal', {
            conversationId: activeCall.conversationId,
            callId,
            signal: { type: 'ice-candidate', data: candidate }
          });
        };
        peer.ontrack = ({ streams }) => setRemoteCallStream(streams[0] || null);
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'connected') {
            updateCall((current) => current ? { ...current, status: 'active' } : null);
          } else if (['failed', 'closed'].includes(peer.connectionState)) {
            finishCall(false);
          }
        };
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('call:signal', {
          conversationId: activeCall.conversationId,
          callId,
          signal: { type: 'offer', data: peer.localDescription }
        });
        updateCall({ ...activeCall, status: 'connecting' });
      } catch (callError) {
        setError(getErrorMessage(callError, 'Could not connect the video call.'));
        finishCall(true);
      }
    });
    socket.on('call:reject', ({ callId }) => {
      if (callRef.current?.callId !== callId) return;
      setError(callRef.current.status === 'incoming'
        ? 'The caller ended the invitation.'
        : 'The other participant declined or missed the video call.');
      finishCall(false);
    });
    socket.on('call:end', ({ callId }) => {
      if (callRef.current?.callId !== callId) return;
      finishCall(false);
    });
    socket.on('call:signal', async ({ callId, signal }) => {
      const activeCall = callRef.current;
      if (!activeCall || activeCall.callId !== callId) return;
      try {
        if (signal.type === 'offer' && !peerConnectionRef.current) {
          const iceResponse = await axios.get(`${MESSAGE_URL}/ice-config`, requestConfig());
          const peer = new RTCPeerConnection({ iceServers: iceResponse.data.iceServers });
          peerConnectionRef.current = peer;
          localCallStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localCallStreamRef.current));
          peer.onicecandidate = ({ candidate }) => {
            if (candidate) socket.emit('call:signal', {
              conversationId: activeCall.conversationId,
              callId,
              signal: { type: 'ice-candidate', data: candidate }
            });
          };
          peer.ontrack = ({ streams }) => setRemoteCallStream(streams[0] || null);
          peer.onconnectionstatechange = () => {
            if (peer.connectionState === 'connected') {
              updateCall((current) => current ? { ...current, status: 'active' } : null);
            } else if (['failed', 'closed'].includes(peer.connectionState)) {
              finishCall(false);
            }
          };
          await peer.setRemoteDescription(signal.data);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await Promise.all(pendingIceCandidatesRef.current.splice(0).map((candidate) => peer.addIceCandidate(candidate)));
          socket.emit('call:signal', {
            conversationId: activeCall.conversationId,
            callId,
            signal: { type: 'answer', data: peer.localDescription }
          });
          updateCall({ ...activeCall, status: 'connecting' });
        } else if (signal.type === 'answer' && peerConnectionRef.current?.signalingState === 'have-local-offer') {
          await peerConnectionRef.current.setRemoteDescription(signal.data);
          await Promise.all(pendingIceCandidatesRef.current.splice(0).map((candidate) => peerConnectionRef.current.addIceCandidate(candidate)));
        } else if (signal.type === 'ice-candidate' && signal.data) {
          if (peerConnectionRef.current?.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(signal.data);
          } else {
            pendingIceCandidatesRef.current.push(signal.data);
          }
        }
      } catch (callError) {
        setError(getErrorMessage(callError, 'Could not establish the video connection.'));
        finishCall(true);
      }
    });

    return () => {
      if (callRef.current?.conversationId === activeConversationId) finishCall(true);
      socket.emit('conversation:leave', { conversationId: activeConversationId });
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [activeConversationId, finishCall, updateCall, user.name]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localCallStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteCallStream;
  }, [localCallStream, remoteCallStream, call]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
      setRecordingSeconds(elapsed);
      if (elapsed >= VOICE_NOTE_LIMIT_SECONDS) recorderRef.current?.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    peerConnectionRef.current?.close();
    localCallStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const sendText = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activeConversationId || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await axios.post(
        `${MESSAGE_URL}/conversations/${activeConversationId}/messages`,
        { text },
        requestConfig()
      );
      setMessages((current) => [...current, response.data.message]);
      setDraft('');
      await loadConversations();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not send your message.'));
    } finally {
      setSending(false);
    }
  };

  const uploadVoiceNote = async (blob, durationSeconds) => {
    if (!activeConversationId) return;
    setError('');
    try {
      const response = await axios.post(
        `${MESSAGE_URL}/conversations/${activeConversationId}/voice-notes`,
        blob,
        {
          ...requestConfig(),
          headers: {
            ...requestConfig().headers,
            'Content-Type': blob.type,
            'X-Audio-Duration': String(durationSeconds)
          }
        }
      );
      setMessages((current) => [...current, response.data.message]);
      await loadConversations();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not send your voice note.'));
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is not supported by this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError('The voice recording could not be completed. Please try again.');
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        const duration = Math.min(
          VOICE_NOTE_LIMIT_SECONDS,
          Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000))
        );
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (blob.size) uploadVoiceNote(blob, duration);
      };
      recorder.start();
      setRecording(true);
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Allow microphone access to record a voice note.'));
    }
  };

  const startVideoCall = async () => {
    const socket = socketRef.current;
    if (!socket?.connected || !activeConversationId) {
      setError('Real-time calling is not connected. Check your connection and try again.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      setError('Video calling is not supported by this browser.');
      return;
    }
    try {
      setError('');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localCallStreamRef.current = mediaStream;
      setLocalCallStream(mediaStream);
      const callId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const nextCall = { callId, conversationId: activeConversationId, status: 'dialing', initiator: true };
      updateCall(nextCall);
      socket.emit('call:invite', { conversationId: activeConversationId, callId }, (result) => {
        if (!result?.ok) {
          setError(result?.message || 'Could not start the video call.');
          finishCall(false);
        }
      });
    } catch (callError) {
      setError(getErrorMessage(callError, 'Allow camera and microphone access to start a video call.'));
    }
  };

  const acceptVideoCall = async () => {
    const activeCall = callRef.current;
    if (!activeCall || !socketRef.current?.connected) return;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localCallStreamRef.current = mediaStream;
      setLocalCallStream(mediaStream);
      updateCall({ ...activeCall, status: 'connecting' });
      socketRef.current.emit('call:accept', {
        conversationId: activeCall.conversationId,
        callId: activeCall.callId
      });
    } catch (callError) {
      setError(getErrorMessage(callError, 'Allow camera and microphone access to answer the video call.'));
      const pendingCall = callRef.current;
      if (pendingCall) socketRef.current?.emit('call:reject', {
        conversationId: pendingCall.conversationId,
        callId: pendingCall.callId
      });
      finishCall(false);
    }
  };

  const rejectVideoCall = () => {
    const activeCall = callRef.current;
    if (activeCall) {
      socketRef.current?.emit('call:reject', {
        conversationId: activeCall.conversationId,
        callId: activeCall.callId
      });
    }
    finishCall(false);
  };

  return (
    <section className="flex min-h-[min(720px,calc(100vh-150px))] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]" aria-label="Messages">
      <aside className={`${activeConversationId ? 'hidden sm:flex' : 'flex'} w-full shrink-0 flex-col border-r border-[var(--line)] sm:w-[280px]`} aria-label="Conversations">
        <div className="border-b border-[var(--line)] px-4 py-4">
          <h1 className="text-[17px] font-bold">Messages</h1>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{user.role === 'vendor' ? 'Chats with customers about your products.' : 'Talk with sellers about their products.'}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingConversations ? (
            <p className="px-4 py-6 text-[12px] text-[var(--muted)]">Loading conversations…</p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-6 text-[12px] leading-relaxed text-[var(--muted)]">
              {user.role === 'vendor' ? 'Customer conversations will appear here when they contact you from a product.' : 'Open Products and select “Message seller” on a product to start a conversation.'}
            </p>
          ) : conversations.map((conversation) => (
            <button
              type="button"
              key={conversation._id}
              onClick={() => setActiveConversationId(conversation._id)}
              className={`w-full border-b border-[var(--line)] px-4 py-4 text-left transition hover:bg-[var(--paper)] ${activeConversationId === conversation._id ? 'bg-[var(--mint)]' : ''}`}
              aria-current={activeConversationId === conversation._id ? 'true' : undefined}
            >
              <span className="block truncate text-[12px] font-semibold">{conversation.otherParticipant?.name || 'Workspace member'}</span>
              <span className="mt-1 block truncate text-[10px] text-[var(--muted)]">{conversation.product?.name || 'Product'} · {conversation.lastMessage || 'Conversation started'}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className={`${activeConversationId ? 'flex' : 'hidden sm:flex'} min-w-0 flex-1 flex-col`}>
        {activeConversation ? (
          <>
            <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
              <button type="button" className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--paper)] sm:hidden" onClick={() => setActiveConversationId('')}>Back</button>
              <div className="min-w-0">
                <h2 className="truncate text-[13px] font-bold">{activeConversation.otherParticipant?.name || 'Conversation'}</h2>
                <p className="truncate text-[10px] text-[var(--muted)]">About {activeConversation.product?.name || 'a product'}</p>
              </div>
              <button type="button" onClick={startVideoCall} disabled={Boolean(call)} className="primary-action-button ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[10px] font-semibold disabled:cursor-wait disabled:opacity-60">
                <Icon name="video" size={15} /> <span className="hidden sm:inline">Video call</span><span className="sm:hidden">Call</span>
              </button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" aria-live="polite">
              {loadingMessages ? (
                <p className="text-center text-[11px] text-[var(--muted)]">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-[var(--muted)]">Start the conversation with a message or a voice note.</p>
              ) : messages.map((message) => {
                const ownMessage = String(message.sender?._id || message.sender) === user.id;
                return (
                  <article key={message._id} className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[min(85%,480px)] rounded-2xl px-3.5 py-2.5 ${ownMessage ? 'bg-[var(--mint)]' : 'border border-[var(--line)] bg-[var(--paper)]'}`}>
                      {!ownMessage && <p className="mb-1 text-[10px] font-semibold text-[var(--muted)]">{message.sender?.name || 'Participant'}</p>}
                      {message.type === 'voice' ? <VoiceNote message={message} /> : <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed">{message.text}</p>}
                      <time className="mt-1 block text-right text-[9px] text-[var(--muted)]">{formatTime(message.createdAt)}</time>
                    </div>
                  </article>
                );
              })}
            </div>
            {error && <p className="mx-4 mb-2 rounded-lg bg-[#fff3ee] px-3 py-2 text-[11px] text-[#914a32]" role="alert">{error}</p>}
            <form onSubmit={sendText} className="flex items-end gap-2 border-t border-[var(--line)] p-3 sm:p-4">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={4000}
                rows={1}
                placeholder="Write a message…"
                aria-label="Write a message"
                className="form-control max-h-28 min-h-11 flex-1 resize-y rounded-xl px-3 py-3 text-[12px]"
              />
              <button type="button" onClick={recording ? () => recorderRef.current?.stop() : startRecording} disabled={sending} className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-[11px] font-semibold transition ${recording ? 'border-[#d9b3a5] text-[#a45136]' : 'border-[var(--line)] text-[var(--ink)] hover:bg-[var(--paper)]'}`} aria-label={recording ? 'Stop and send voice note' : 'Record voice note'} title={recording ? `Stop recording (${recordingSeconds}s)` : 'Record voice note'}>
                <span className={`h-2 w-2 rounded-full ${recording ? 'animate-pulse bg-[#c45b42]' : 'bg-[#7aa846]'}`} />
                <span className="hidden sm:inline">{recording ? `Stop ${recordingSeconds}s` : 'Voice note'}</span>
              </button>
              <button type="submit" disabled={sending || !draft.trim()} className="primary-action-button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:px-4">
                <span className="hidden sm:inline">{sending ? 'Sending…' : 'Send'}</span>
                <Icon name="arrow" size={15} />
              </button>
            </form>
            <p className="px-4 pb-3 text-[9px] text-[var(--muted)]">Voice notes are limited to 2 minutes and require microphone permission.</p>
          </>
        ) : (
          <div className="m-auto max-w-[360px] px-6 py-10 text-center">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-[var(--mint)]"><Icon name="users" /></div>
            <h2 className="text-[14px] font-bold">Your conversations</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">Choose a conversation or contact a seller from a product to exchange messages and voice notes.</p>
          </div>
        )}
      </div>
      {call && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Video call">
          <section className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-[#18201c] text-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
              <div>
                <h2 className="text-[14px] font-bold">{call.status === 'incoming' ? 'Incoming video call' : call.status === 'dialing' ? 'Calling…' : call.status === 'active' ? 'Video call' : 'Connecting…'}</h2>
                <p className="mt-1 text-[10px] text-white/65">{call.callerName || activeConversation?.otherParticipant?.name || 'Conversation participant'}</p>
              </div>
              {call.status !== 'incoming' && <button type="button" onClick={() => finishCall(true)} className="rounded-lg bg-[#a83f37] px-3 py-2 text-[11px] font-bold hover:bg-[#c64d43]">End call</button>}
            </header>
            {call.status === 'incoming' ? (
              <div className="grid justify-items-center gap-4 px-6 py-12 text-center">
                <p className="text-[12px] text-white/75">A participant in this conversation would like to talk.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={rejectVideoCall} className="rounded-xl bg-[#a83f37] px-5 py-3 text-[11px] font-semibold hover:bg-[#c64d43]">Decline</button>
                  <button type="button" onClick={acceptVideoCall} className="primary-action-button rounded-xl px-5 py-3 text-[11px] font-semibold">Accept call</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 p-3 sm:grid-cols-[1fr_220px] sm:p-5">
                <div className="relative grid min-h-[240px] place-items-center overflow-hidden rounded-xl bg-[#0d100e] sm:min-h-[420px]">
                  <video ref={remoteVideoRef} autoPlay playsInline className="h-full max-h-[65vh] w-full object-contain" aria-label="Other participant video" />
                  {!remoteCallStream && <p className="absolute text-[12px] text-white/70">{call.status === 'dialing' ? 'Waiting for them to answer…' : 'Waiting for video…'}</p>}
                </div>
                <div className="relative min-h-[160px] overflow-hidden rounded-xl bg-[#0d100e] sm:min-h-0">
                  <video ref={localVideoRef} autoPlay muted playsInline className="h-full max-h-[65vh] min-h-[160px] w-full object-cover sm:min-h-0" aria-label="Your camera preview" />
                  {!localCallStream && <p className="absolute inset-0 grid place-items-center text-[11px] text-white/70">Starting camera…</p>}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default Messages;
