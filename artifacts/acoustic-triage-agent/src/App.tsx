import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, Clock3, FileAudio2, Headphones, Mic, RefreshCw, ShieldCheck, Square, UploadCloud, X } from 'lucide-react';
import { Link, Route, Switch, useParams } from 'wouter';
import {
  getGetTriageDashboardSummaryQueryKey,
  getGetTriageTicketQueryKey,
  getListTriageTicketsQueryKey,
  useAnalyzeAudioTicket,
  useGetTriageDashboardSummary,
  useGetTriageTicket,
  useListTriageTickets,
} from '@workspace/api-client-react';
import type { TriageCategory, TriageTicket } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const categoryNames: Record<TriageCategory, string> = {
  HARDWARE_AUDIO_CAPTURE: 'Audio capture',
  DESKTOP_CLIENT_CRASH: 'Desktop client',
  SYNC_INFRASTRUCTURE: 'Sync infrastructure',
  UNKNOWN_NEEDS_HUMAN: 'Needs human review',
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function Header() {
  return <>
    <div className="announcement-bar"><span>ACOUSTIC SUPPORT INTELLIGENCE</span><span>From spoken report to clear next step</span></div>
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-home">
        <span className="brand-mark"><AudioLines size={19} strokeWidth={2.2} /></span>
        <span>acoustic<span style={{ color: 'hsl(var(--primary))' }}>.</span><small>TRIAGE AGENT</small></span>
      </Link>
      <nav className="horizontal-nav" aria-label="Main navigation">
        <Link href="/" className="nav-link" data-testid="link-nav-overview">Overview</Link>
        <Link href="/#ticket-feed" className="nav-link" data-testid="link-nav-tickets">Ticket feed</Link>
      </nav>
      <div className="top-right">
        <span className="live"><i className="live-dot" /> SUPPORT INTAKE</span>
        <span className="date mono" data-testid="text-current-date">{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span>
        <Link href="/#ticket-feed" className="nav-cta" data-testid="link-nav-start">Start intake <ArrowRight size={13} /></Link>
      </div>
    </header>
  </>;
}

function SummaryStrip() {
  const { data, isLoading, isError, refetch } = useGetTriageDashboardSummary({
    query: { queryKey: getGetTriageDashboardSummaryQueryKey(), refetchInterval: 12000 },
  });
  const values = [
    { label: 'Tickets analyzed', value: data?.totalTickets, note: 'all time' },
    { label: 'Auto-routed', value: data?.autoRouted, note: 'ready for action' },
    { label: 'Human review', value: data?.needsHuman, note: 'needs a closer listen' },
    { label: 'Categories', value: data ? Object.values(data.categoryCounts).filter((count) => count > 0).length : undefined, note: 'active signals' },
  ];
  return <section className="summary-grid" aria-label="Ticket summary">
    {values.map((item, index) => <div className="summary-card" key={item.label} data-testid={`summary-card-${index}`}>
      <div className="summary-label">{item.label}</div>
      {isError ? <button className="subtle-button" onClick={() => refetch()} data-testid="button-retry-summary">Retry</button> :
        <div className="summary-number" data-testid={`summary-value-${index}`}>{isLoading ? <span className="mono" style={{ fontSize: 16, color: '#aab1a9' }}>—</span> : item.value}</div>}
      <div className="summary-note">{isError ? 'Unable to load' : item.note}</div>
    </div>)}
  </section>;
}

function UploadBox() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState('');
  const [success, setSuccess] = useState<TriageTicket | null>(null);
  const [mode, setMode] = useState<'upload' | 'realtime'>('upload');
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const analyze = useAnalyzeAudioTicket({
    mutation: {
      onSuccess: async (ticket) => {
        setSuccess(ticket);
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListTriageTicketsQueryKey({ limit: 30 }) }),
          queryClient.invalidateQueries({ queryKey: getGetTriageDashboardSummaryQueryKey() }),
        ]);
      },
    },
  });

  function acceptFile(candidate?: File) {
    setSuccess(null);
    setLocalError('');
    if (!candidate) return;
    const extension = candidate.name.split('.').pop()?.toLowerCase();
    if (!['wav', 'mp3'].includes(extension ?? '')) {
      setFile(null);
      setLocalError('Choose a WAV or MP3 recording to continue.');
      return;
    }
    setFile(candidate);
  }
  function onChange(event: ChangeEvent<HTMLInputElement>) { acceptFile(event.currentTarget.files?.[0]); }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }
  async function submit() {
    if (!file || analyze.isPending) return;
    setLocalError('');
    setSuccess(null);
    try {
      await analyze.mutateAsync({ data: { audio: file } });
    } catch {
      setLocalError('That recording could not be analyzed. Check the file and try again.');
    }
  }

  return <section className="panel" id="ticket-feed">
    <div className="panel-head">
      <div><h2>Turn a voice report into a ticket</h2><p>Choose a recording or transcribe a live customer report.</p></div>
      <span className="count-pill mono">01 / INTAKE</span>
    </div>
    <div className="intake-switch" role="tablist" aria-label="Intake mode">
      <button className={`intake-tab${mode === 'upload' ? ' selected' : ''}`} role="tab" aria-selected={mode === 'upload'} onClick={() => setMode('upload')} data-testid="button-mode-upload"><UploadCloud size={15} /> Upload</button>
      <button className={`intake-tab${mode === 'realtime' ? ' selected' : ''}`} role="tab" aria-selected={mode === 'realtime'} onClick={() => setMode('realtime')} data-testid="button-mode-realtime"><Mic size={15} /> Realtime</button>
    </div>
    {mode === 'upload' ? <>
    <div className="drop-panel">
      <div className={`upload-zone${dragging ? ' dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} data-testid="dropzone-audio-upload">
        {analyze.isPending ? <>
          <span className="upload-icon"><AudioLines size={21} /></span>
          <strong>Preparing the handoff</strong>
          <p>Creating a simulated transcript and routing preview…</p>
          <div className="processing" role="status" data-testid="status-processing">Simulated analysis in progress<span className="processing-track"><i /></span></div>
        </> : file ? <>
          <span className="upload-icon"><FileAudio2 size={21} /></span>
          <strong>Recording ready</strong>
          <div className="selected-file" data-testid="selected-audio-file">
            <FileAudio2 size={16} color="#36756b" /><span>{file.name}</span>
            <button onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }} aria-label="Remove selected file" data-testid="button-remove-file"><X size={15} /></button>
          </div>
          <button className="primary-button" onClick={submit} data-testid="button-analyze-audio">Create simulated ticket <ArrowRight size={14} style={{ verticalAlign: 'middle', marginLeft: 5 }} /></button>
        </> : <>
          <span className="upload-icon"><UploadCloud size={21} /></span>
          <strong>Drop a voice report here</strong>
          <p>or choose a recording from your device</p>
          <button className="choose-button" onClick={() => inputRef.current?.click()} data-testid="button-choose-audio">Choose audio file</button>
          <input ref={inputRef} type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" onChange={onChange} hidden data-testid="input-audio-file" />
        </>}
      </div>
      {localError && <div className="upload-error" role="alert" data-testid="status-upload-error">{localError}</div>}
      {success && <div className="processing" data-testid="status-upload-success">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Check size={15} /> Categorized as <strong>{categoryNames[success.category]}</strong></div>
        <Link href={`/tickets/${encodeURIComponent(success.id)}`} className="back-link" style={{ margin: '8px 0 0', color: '#286b64' }} data-testid={`link-new-ticket-${success.id}`}>View ticket <ArrowRight size={13} /></Link>
      </div>}
      <div className="file-note">
        SIMULATED UPLOAD · AUDIO BYTES ARE NOT TRANSCRIBED
        <br />
        WAV · MP3 &nbsp; / &nbsp; Example routing is selected from filename hints
      </div>
    </div>
    </> : <RealtimeIntake onTicket={async (ticket) => {
      setSuccess(ticket);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListTriageTicketsQueryKey({ limit: 30 }) }),
        queryClient.invalidateQueries({ queryKey: getGetTriageDashboardSummaryQueryKey() }),
      ]);
    }} />}
  </section>;
}

type RealtimeIntakeProps = { onTicket: (ticket: TriageTicket) => Promise<void> };
type RealtimeMessage =
  | { type: 'connection_ready' }
  | { type: 'transcript'; text: string; is_final?: boolean }
  | { type: 'ticket_categorized'; ticket: TriageTicket }
  | { type: 'flush_complete'; status: 'saved' | 'empty' | 'failed' }
  | { type: 'error'; message: string };

function RealtimeIntake({ onTicket }: RealtimeIntakeProps) {
  const [connection, setConnection] = useState<'disconnected' | 'connecting' | 'ready' | 'recording' | 'saving'>('disconnected');
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState('');
  const [savedTicket, setSavedTicket] = useState<TriageTicket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  const finalTextRef = useRef('');
  const sentTicketRef = useRef(false);
  const flushOnStopRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) wsRef.current.close();
    };
  }, []);

  function releaseCapture() {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function fail(message: string) {
    if (!aliveRef.current) return;
    setError(message);
    setConnection('disconnected');
    releaseCapture();
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    const socket = wsRef.current;
    wsRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    setConnection('saving');
    setInterimText('');
    flushOnStopRef.current = true;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    recorder.stop();
  }

  async function startRecording() {
    if (connection !== 'disconnected') return;
    setError('');
    setSavedTicket(null);
    setFinalText('');
    finalTextRef.current = '';
    sentTicketRef.current = false;
    flushOnStopRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      fail('Microphone access is not available in this browser. Try a supported browser over HTTPS.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      fail('Live recording is not supported by this browser. Try a current version of Chrome, Edge, or Firefox.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (reason) {
      const denied = reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'PermissionDeniedError');
      fail(denied ? 'Microphone permission was denied. Allow microphone access in your browser, then retry.' : 'The microphone could not be opened. Check that it is connected and not in use.');
      return;
    }
    streamRef.current = stream;
    setConnection('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
    } catch {
      fail('Could not open the live transcription connection. Check your connection and retry.');
      return;
    }
    wsRef.current = socket;
    socket.onmessage = (event: MessageEvent<string>) => {
      let message: RealtimeMessage;
      try { message = JSON.parse(event.data) as RealtimeMessage; } catch { return; }
      if (message.type === 'connection_ready') {
        try {
          const recorder = new MediaRecorder(stream);
          recorderRef.current = recorder;
          recorder.ondataavailable = (audioEvent) => {
            if (audioEvent.data.size > 0 && socket.readyState === WebSocket.OPEN) socket.send(audioEvent.data);
          };
          recorder.onerror = () => fail('The browser stopped recording unexpectedly. You can retry this session.');
          recorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            if (flushOnStopRef.current && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'flush_request' }));
            else if (flushOnStopRef.current) fail('The live connection closed before the recording could be saved. Retry to start again.');
          };
          recorder.start(250);
          setConnection('recording');
          timeoutRef.current = window.setTimeout(stopRecording, 9 * 60 * 1000);
        } catch {
          fail('The microphone stream could not start. Check browser recording settings and retry.');
        }
      } else if (message.type === 'transcript') {
        if (message.is_final === false) setInterimText(message.text);
        else {
          const next = [finalTextRef.current, message.text.trim()].filter(Boolean).join(' ');
          finalTextRef.current = next;
          setFinalText(next);
          setInterimText('');
        }
      } else if (message.type === 'ticket_categorized') {
        setSavedTicket(message.ticket);
        if (!sentTicketRef.current) {
          sentTicketRef.current = true;
          void onTicket(message.ticket);
        }
      } else if (message.type === 'flush_complete') {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        if (message.status === 'empty') fail('No speech was detected, so no ticket was created. Try again in a quieter space.');
        if (message.status === 'failed') fail('The transcript could not be saved. No ticket was created; please retry.');
        if (message.status === 'saved') {
          setConnection('disconnected');
          wsRef.current = null;
          socket.close();
        }
      } else if (message.type === 'error') fail(message.message || 'Realtime transcription encountered an error. Please retry.');
    };
    socket.onopen = () => { /* connection_ready, not socket open, starts capture */ };
    socket.onerror = () => fail('Could not connect to live transcription. Check your connection and retry.');
    socket.onclose = () => {
      if (wsRef.current === socket) fail('The live transcription connection closed. Your recording was not saved; please retry.');
    };
  }

  return <div className="realtime-panel">
    <div className={`realtime-status ${connection}`} role="status" data-testid="status-realtime-connection">
      <span className="status-indicator" />
      <span>{connection === 'connecting' ? 'Connecting to Reson8' : connection === 'recording' ? 'Listening live' : connection === 'saving' ? 'Saving your ticket' : 'Microphone ready'}</span>
    </div>
    <div className="live-transcript" aria-live="polite" aria-label="Live transcript preview" data-testid="text-live-transcript">
      {finalText || interimText ? <p>{finalText}{finalText && interimText ? ' ' : ''}<em>{interimText}</em></p> : <p className="transcript-placeholder">{connection === 'recording' ? 'Transcript will appear here as the customer speaks…' : 'Start a session to see the transcript appear here.'}</p>}
    </div>
    {connection === 'disconnected' ?
      <button className="primary-button realtime-action" onClick={startRecording} data-testid="button-start-realtime"><Mic size={15} /> Start live transcription</button> :
      <button className="stop-button realtime-action" onClick={stopRecording} disabled={connection !== 'recording'} data-testid="button-stop-realtime">{connection === 'recording' ? <Square size={13} /> : <AudioLines size={15} />} {connection === 'recording' ? 'Stop & create ticket' : connection === 'saving' ? 'Finishing transcript…' : 'Connecting…'}</button>}
    {error && <div className="upload-error" role="alert" data-testid="status-realtime-error">{error}</div>}
    {savedTicket && <div className="processing realtime-success" data-testid="status-realtime-saved">
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Check size={15} /> Ticket saved · <strong>{categoryNames[savedTicket.category]}</strong></div>
      <Link href={`/tickets/${encodeURIComponent(savedTicket.id)}`} className="back-link" style={{ margin: '8px 0 0', color: '#286b64' }} data-testid={`link-realtime-ticket-${savedTicket.id}`}>Open ticket <ArrowRight size={13} /></Link>
    </div>}
    <div className="file-note">REAL-TIME TRANSCRIPTION · RESON8 · AUTOMATIC LANGUAGE DETECTION<br />Microphone audio streams securely through the server proxy. Sessions are limited to 10 minutes.</div>
  </div>;
}

/* previous upload UI is intentionally simulated; realtime mode is the live transcription path. */

function CategoryBreakdown() {
  const { data } = useGetTriageDashboardSummary({ query: { queryKey: getGetTriageDashboardSummaryQueryKey(), refetchInterval: 12000 } });
  const counts = data?.categoryCounts;
  const rows = [
    { key: 'HARDWARE_AUDIO_CAPTURE' as const, label: 'Audio capture', color: '' },
    { key: 'DESKTOP_CLIENT_CRASH' as const, label: 'Desktop client', color: '' },
    { key: 'SYNC_INFRASTRUCTURE' as const, label: 'Sync infrastructure', color: '' },
    { key: 'UNKNOWN_NEEDS_HUMAN' as const, label: 'Human review', color: 'orange' },
  ];
  const maximum = Math.max(1, ...rows.map((row) => counts?.[row.key] ?? 0));
  return <section className="panel">
    <div className="category-list">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ margin: 0 }}>Signal distribution</h3><AudioLines size={17} color="#47877b" />
      </div>
      {rows.map((row) => {
        const count = counts?.[row.key] ?? 0;
        return <div className="cat-row" key={row.key} data-testid={`category-row-${row.key}`}>
          <span className="cat-name">{row.label}</span><span className="cat-count">{data ? count : '—'}</span>
          <span className="bar"><i className={row.color} style={{ width: `${data ? (count / maximum) * 100 : 0}%` }} /></span>
        </div>;
      })}
      <div className="category-foot"><span>ROUTING MODEL</span><span className="mono">VOICE → SIGNAL → TICKET</span></div>
    </div>
  </section>;
}

function TicketFeed() {
  const { data, isLoading, isError, refetch } = useListTriageTickets({ limit: 30 }, {
    query: { queryKey: getListTriageTicketsQueryKey({ limit: 30 }), refetchInterval: 10000 },
  });
  return <section className="panel">
    <div className="panel-head">
      <div><h2>Latest tickets</h2><p>Freshly categorized customer reports</p></div>
      <span className="count-pill mono">{data ? String(data.length).padStart(2, '0') : '—'} / 30</span>
    </div>
    {isLoading ? <div aria-label="Loading tickets" data-testid="status-tickets-loading">{[0, 1, 2, 3].map((n) => <div className="skeleton" key={n} />)}</div> :
      isError ? <div className="error-state" data-testid="status-tickets-error"><CircleHelp size={26} /><strong>Feed unavailable</strong><p>Ticket updates could not be reached.</p><button className="subtle-button" onClick={() => refetch()} data-testid="button-retry-tickets"><RefreshCw size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />Try again</button></div> :
      !data?.length ? <div className="empty-state" data-testid="status-tickets-empty"><Headphones size={28} /><strong>No reports yet</strong><p>Upload a voice recording to create your first categorized ticket.</p></div> :
      <div>{data.map((ticket) => <TicketRow ticket={ticket} key={ticket.id} />)}</div>}
  </section>;
}

function TicketRow({ ticket }: { ticket: TriageTicket }) {
  const needsHuman = ticket.category === 'UNKNOWN_NEEDS_HUMAN';
  return <Link href={`/tickets/${encodeURIComponent(ticket.id)}`} className="feed-item" data-testid={`link-ticket-${ticket.id}`}>
    <span className={`priority-mark${ticket.priority === 'NORMAL' ? ' normal' : ''}`} />
    <span className="feed-main">
      <span className="feed-title-row">
        <span className="file-title" data-testid={`text-ticket-file-${ticket.id}`}>{ticket.fileName}</span>
        <span className={`priority-badge${ticket.priority === 'HIGH' ? ' high' : ''}`} data-testid={`priority-ticket-${ticket.id}`}>{ticket.priority} PRIORITY</span>
        <span className={`tag${needsHuman ? ' human' : ''}`} data-testid={`status-ticket-tag-${ticket.id}`}>{ticket.tag}</span>
      </span>
      <span className="feed-transcript" data-testid={`text-ticket-transcript-${ticket.id}`}>{ticket.transcript}</span>
      <span className="feed-action" data-testid={`text-ticket-action-${ticket.id}`}><strong>Next action</strong> {ticket.recommendation}</span>
      <span className="feed-meta"><span className="category" data-testid={`text-ticket-category-${ticket.id}`}>{categoryNames[ticket.category]}</span><span>·</span><span data-testid={`status-ticket-${ticket.id}`}>{ticket.status}</span><span>·</span><span data-testid={`text-ticket-time-${ticket.id}`}>{formatTime(ticket.createdAt)}</span></span>
    </span>
    <span className="row-open"><ChevronRight size={17} /></span>
  </Link>;
}

function Dashboard() {
  return <div className="shell"><Header /><main className="content workspace-content fade-in">
    <div className="page-heading">
      <div><div className="eyebrow">SUPPORT OPERATIONS / OVERVIEW</div><h1>Hear the signal.</h1><p>Customer voice, translated into the next right action.</p></div>
      <div className="hero-side">
        <p>Capture the customer’s words, surface the issue, and hand support a clear next step — without losing the detail in between.</p>
        <div className="hero-proof"><span><Check size={13} /> Clear routing</span><span><ShieldCheck size={13} /> Human review built in</span><span><AudioLines size={13} /> Live mic or simulated upload</span></div>
      </div>
    </div>
    <SummaryStrip />
    <div className="work-grid">
      <div style={{ display: 'grid', gap: 16 }}><UploadBox /><TicketFeed /></div>
      <div style={{ display: 'grid', gap: 16 }}>
        <CategoryBreakdown />
        <section className="panel" style={{ padding: '19px 21px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><ShieldCheck size={19} color="#47877b" />
            <div><div style={{ font: "600 13px 'Space Grotesk',sans-serif" }}>Built for a clean handoff</div><p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', lineHeight: 1.6, margin: '7px 0 0' }}>Live audio streams to Reson8 for transcription. Acoustic stores the ticket transcript, not the recording; uploads remain simulated previews.</p></div>
          </div>
        </section>
      </div>
    </div>
    <div className="footer-note">ACOUSTIC TRIAGE AGENT &nbsp;·&nbsp; SUPPORT SIGNAL, WITHOUT THE STATIC</div>
  </main></div>;
}

function TicketDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const safeId = decodeURIComponent(id);
  const { data, isLoading, isError, refetch } = useGetTriageTicket(safeId, {
    query: { queryKey: getGetTriageTicketQueryKey(safeId), enabled: Boolean(safeId) },
  });
  return <div className="shell"><Header /><main className="content detail-content workspace-content fade-in">
    <Link href="/" className="back-link" data-testid="link-back-dashboard"><ArrowLeft size={15} /> Back to ticket feed</Link>
    {isLoading ? <><div className="skeleton" style={{ height: 165, borderRadius: 16 }} /><div className="skeleton" style={{ height: 240, marginTop: 16, borderRadius: 16 }} /></> :
      isError || !data ? <div className="panel error-state" data-testid="status-ticket-error"><CircleHelp size={30} /><strong>Ticket not available</strong><p>We couldn't load this ticket. It may have moved or the connection was interrupted.</p><button className="subtle-button" onClick={() => refetch()} data-testid="button-retry-ticket"><RefreshCw size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />Try again</button></div> :
      <>
        <section className="detail-banner" data-testid="ticket-detail-banner">
          <div className="eyebrow">CATEGORIZED SUPPORT TICKET</div>
          <h1 data-testid="text-ticket-detail-filename">{data.fileName}</h1>
          <div className="detail-banner-meta"><span className="tag" data-testid="text-ticket-detail-category">{categoryNames[data.category]}</span><span>{data.status}</span><span>·</span><span><Clock3 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{formatTime(data.createdAt)}</span></div>
        </section>
        <div className="detail-layout">
          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <section className="panel detail-panel"><h2>Voice report transcript</h2><p className="transcript" data-testid="text-ticket-detail-transcript">{data.transcript}</p></section>
            <section className="panel detail-panel"><h2>Recommended next step</h2><div className="recommendation" data-testid="text-ticket-recommendation">{data.recommendation}</div></section>
          </div>
          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <section className="panel detail-panel"><h2>Ticket signals</h2>
              <div className="kv"><span>Category</span><span data-testid="value-ticket-category">{categoryNames[data.category]}</span></div>
              <div className="kv"><span>Priority</span><span className={data.priority === 'HIGH' ? 'badge-high' : 'badge-normal'} data-testid="value-ticket-priority">{data.priority}</span></div>
              <div className="kv"><span>Status</span><span data-testid="value-ticket-status">{data.status}</span></div>
              <div className="kv"><span>Routing</span><span data-testid="value-ticket-tag">{data.tag}</span></div>
              <div className="kv"><span>Received</span><span data-testid="value-ticket-timestamp">{formatTime(data.createdAt)}</span></div>
              <div className="kv"><span>Ticket ID</span><span className="mono" data-testid="value-ticket-id">{data.id}</span></div>
            </section>
             <section className="panel detail-panel" style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
               <ShieldCheck size={18} color="#47877b" /><div><h2 style={{ marginBottom: 6 }}>{data.fileName === 'live-microphone.webm' ? 'Realtime transcription' : 'Simulated upload'}</h2><p style={{ margin: 0, fontSize: 11, color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>{data.fileName === 'live-microphone.webm' ? 'This ticket was created from a live Reson8 microphone transcript.' : 'This transcript is a canned example selected by filename hints. Uploaded audio content is not decoded or stored.'}</p></div>
            </section>
          </div>
        </div>
      </>}
    <div className="footer-note">ACOUSTIC TRIAGE AGENT &nbsp;·&nbsp; SUPPORT SIGNAL, WITHOUT THE STATIC</div>
  </main></div>;
}

function AppRouter() {
  return <ErrorBoundary><Switch>
    <Route path="/" component={Dashboard} />
    <Route path="/tickets/:id" component={TicketDetail} />
    <Route component={NotFound} />
  </Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><AppRouter /><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
