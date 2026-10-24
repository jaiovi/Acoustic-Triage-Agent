import { useRef, useState, type AnchorHTMLAttributes, type ChangeEvent, type DragEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, FileAudio2, Gauge, Headphones, ListMusic, RefreshCw, ShieldCheck, UploadCloud, X } from 'lucide-react';
type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
function Link({ href, ...props }: LinkProps) { return <a href={href} {...props} />; }
import {
  getGetTriageDashboardSummaryQueryKey,
  getListTriageTicketsQueryKey,
  useAnalyzeAudioTicket,
  useGetTriageDashboardSummary,
  useListTriageTickets,
} from '@workspace/api-client-react';
import type { TriageCategory, TriageTicket } from '@workspace/api-client-react';
import { Toaster } from '../../ui/toaster';
import { TooltipProvider } from '../../ui/tooltip';
import './_group.css';

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
  return <header className="topbar">
    <Link href="/" className="brand" data-testid="link-home">
      <span className="brand-mark"><AudioLines size={19} strokeWidth={2.2} /></span>
      <span>acoustic<span style={{ color: 'hsl(var(--primary))' }}>.</span><small>TRIAGE AGENT</small></span>
    </Link>
    <div className="top-right">
      <span className="live"><i className="live-dot" /> SIMULATED INTAKE</span>
      <span className="date mono" data-testid="text-current-date">{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span>
    </div>
  </header>;
}

function Sidebar() {
  return <aside className="side-rail">
    <div className="side-label">WORKSPACE</div>
    <nav className="side-nav" aria-label="Main navigation">
      <Link href="/" className="side-link" data-testid="link-sidebar-overview"><Gauge size={16} /> Overview</Link>
      <a href="/#ticket-feed" className="side-link" data-testid="link-sidebar-tickets"><ListMusic size={16} /> Ticket feed</a>
    </nav>
    <div className="sidebar-foot">
      <span className="sidebar-orb"><AudioLines size={15} /></span>
      <span>SIMULATION<br /><strong>RESON8 ADAPTER</strong></span>
    </div>
  </aside>;
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
      <div><h2>Analyze a recording</h2><p>Turn a voice report into a technical ticket.</p></div>
      <span className="count-pill mono">01 / INTAKE</span>
    </div>
    <div className="drop-panel">
      <div className={`upload-zone${dragging ? ' dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} data-testid="dropzone-audio-upload">
        {analyze.isPending ? <>
          <span className="upload-icon"><AudioLines size={21} /></span>
          <strong>Listening for signal</strong>
          <p>Transcribing and routing your report…</p>
          <div className="processing" role="status" data-testid="status-processing">Audio is being analyzed<span className="processing-track"><i /></span></div>
        </> : file ? <>
          <span className="upload-icon"><FileAudio2 size={21} /></span>
          <strong>Recording ready</strong>
          <div className="selected-file" data-testid="selected-audio-file">
            <FileAudio2 size={16} color="#36756b" /><span>{file.name}</span>
            <button onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }} aria-label="Remove selected file" data-testid="button-remove-file"><X size={15} /></button>
          </div>
          <button className="primary-button" onClick={submit} data-testid="button-analyze-audio">Analyze recording <ArrowRight size={14} style={{ verticalAlign: 'middle', marginLeft: 5 }} /></button>
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
        SIMULATED TRANSCRIPTION · AUDIO BYTES ARE NOT DECODED OR STORED
        <br />
        WAV · MP3 &nbsp; / &nbsp; Try filenames with mic, crash, or sync to preview routing
      </div>
    </div>
  </section>;
}

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
  return <div className="shell"><Header /><div className="workspace"><Sidebar /><main className="content workspace-content fade-in">
    <div className="page-heading">
      <div><div className="eyebrow">SUPPORT OPERATIONS / OVERVIEW</div><h1>Hear the signal.</h1><p>Customer voice, translated into the next right action.</p></div>
      <div className="live"><i className="live-dot" /> SIMULATION ACTIVE</div>
    </div>
    <SummaryStrip />
    <div className="work-grid">
      <div style={{ display: 'grid', gap: 16 }}><UploadBox /><TicketFeed /></div>
      <div style={{ display: 'grid', gap: 16 }}>
        <CategoryBreakdown />
        <section className="panel" style={{ padding: '19px 21px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><ShieldCheck size={19} color="#47877b" />
            <div><div style={{ font: "600 13px 'Space Grotesk',sans-serif" }}>Built for a clean handoff</div><p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', lineHeight: 1.6, margin: '7px 0 0' }}>Each simulated transcript stays with its category and recommended next step. No audio file is retained.</p></div>
          </div>
        </section>
      </div>
    </div>
    <div className="footer-note">ACOUSTIC TRIAGE AGENT &nbsp;·&nbsp; SUPPORT SIGNAL, WITHOUT THE STATIC</div>
  </main></div></div>;
}

function CurrentApp() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Dashboard /><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default CurrentApp;
