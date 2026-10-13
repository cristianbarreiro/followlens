'use client';
import { Profiler, useEffect, useMemo, useState } from 'react';
import type { ProfilerOnRenderCallback, ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Fingerprint,
  HelpCircle,
  History,
  LayoutDashboard,
  LoaderCircle,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Checkbox } from '@/components/ui/checkbox';
import { ImportDialog } from '@/components/import-dialog';
import { HeroDemoVideo } from '@/components/hero-demo-video';
import {
  analyze,
  csvRows,
  labels,
  relationship,
  timeline,
  type Group,
  type Snapshot,
} from '@/lib/relationships';
import { getSnapshots, saveSnapshot, deleteSnapshot } from '@/lib/storage';
import { demoSnapshots } from '@/lib/demo';

const count = (n: number) => n.toLocaleString('es-UY');
const fmt = (date: string) =>
  new Intl.DateTimeFormat('es-UY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('es-UY', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
const currentGroups: Group[] = [
  'notBack',
  'fans',
  'mutuals',
  'followers',
  'following',
];
const changeGroups: Group[] = [
  'lost',
  'new',
  'unfollowed',
  'followed',
  'lostMutuals',
  'newMutuals',
];
const recordReactProfile: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const benchmark = window.__followLensWorkerE2E;
  if (!benchmark?.profileEnabled) return;
  benchmark.reactProfiles.push({
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  });
  if (
    id === 'relationship-list' &&
    benchmark.interactionTargetGroup !== null &&
    benchmark.interactionStartedAt !== null &&
    benchmark.interactionReactCommittedAt === null
  ) {
    const interactionStartedAt = benchmark.interactionStartedAt;
    benchmark.interactionReactCommittedAt = commitTime;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const frameAt = performance.now();
        if (benchmark.interactionStartedAt === interactionStartedAt)
          benchmark.interactionSecondFrameAt = frameAt;
      });
    });
  }
};
function profileSubtree(id: string, enabled: boolean, children: ReactNode) {
  return enabled ? (
    <Profiler id={id} onRender={recordReactProfile}>
      {children}
    </Profiler>
  ) : (
    children
  );
}
function Picker({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  items: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      items={items}
    >
      <SelectTrigger className="picker" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span className={`avatar tone-${name.charCodeAt(0) % 5}`}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
function Trend({ snapshots }: { snapshots: Snapshot[] }) {
  const points = snapshots.slice(-12),
    values = points.map((s) => s.followers.length),
    max = Math.max(...values, 1),
    min = Math.min(...values, 0),
    range = max - min || 1;
  const coordinates = points.map(
    (s, i) =>
      `${30 + (i / (points.length - 1 || 1)) * 460},${126 - ((s.followers.length - min) / range) * 100}`,
  );
  return (
    <div className="trend">
      <div className="section-heading">
        <div>
          <h3>Tu círculo en el tiempo</h3>
          <small>Seguidores en cada importación</small>
        </div>
        <span className="legend">
          <i /> Seguidores
        </span>
      </div>
      {points.length > 1 ? (
        <>
          <svg
            viewBox="0 0 520 160"
            role="img"
            aria-label={points
              .map((s) => `${fmt(s.date)}: ${s.followers.length} seguidores`)
              .join('. ')}
          >
            <defs>
              <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#645ce0" stopOpacity=".16" />
                <stop offset="100%" stopColor="#645ce0" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[26, 76, 126].map((y) => (
              <line
                key={y}
                x1="30"
                x2="490"
                y1={y}
                y2={y}
                stroke="#e8eaf1"
                strokeDasharray="4 5"
              />
            ))}
            <path
              d={`M${coordinates.join(' L')} L490,140 L30,140 Z`}
              fill="url(#area)"
            />
            <polyline
              points={coordinates.join(' ')}
              fill="none"
              stroke="#6259d6"
              strokeWidth="2.5"
            />
            {points.map((s, i) => {
              const [x, y] = coordinates[i].split(',');
              return (
                <g key={s.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r="4"
                    fill="white"
                    stroke="#6259d6"
                    strokeWidth="2"
                  />
                  <title>
                    {fmt(s.date)}: {s.followers.length}
                  </title>
                </g>
              );
            })}
          </svg>
          <div className="chart-labels">
            <span>{shortDate(points[0].date)}</span>
            <span>{shortDate(points.at(-1)!.date)}</span>
          </div>
          <details className="chart-data">
            <summary>Ver valores</summary>
            {points.map((s) => (
              <div key={s.id}>
                {fmt(s.date)}
                <strong>{count(s.followers.length)}</strong>
              </div>
            ))}
          </details>
        </>
      ) : (
        <p className="subtle chart-empty">
          Con otra importación vas a poder ver cómo evoluciona tu círculo.
        </p>
      )}
    </div>
  );
}
export default function Home() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]),
    [savedIds, setSavedIds] = useState<string[]>([]),
    [importAnalysis, setImportAnalysis] = useState<{
      snapshotId: string;
      data: Record<Group, string[]>;
    } | null>(null),
    [ready, setReady] = useState(false),
    [demo, setDemo] = useState(false),
    [account, setAccount] = useState(''),
    [selected, setSelected] = useState(''),
    [baseline, setBaseline] = useState(''),
    [view, setView] = useState('overview');
  const [group, setGroup] = useState<Group>('notBack'),
    [query, setQuery] = useState(''),
    [onlyFollowing, setOnlyFollowing] = useState(false),
    [page, setPage] = useState(0),
    [importOpen, setImportOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [detail, setDetail] = useState<string | null>(null),
    [remove, setRemove] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    getSnapshots()
      .then((items) => {
        setSnapshots(items);
        setSavedIds(items.map((s) => s.id));
        if (items.length) {
          const latest = [...items].sort((a, b) =>
            b.date.localeCompare(a.date),
          )[0];
          setAccount(latest.account);
        }
      })
      .catch((err) =>
        setError(
          `${err.message} Podés analizar sin guardar en este navegador.`,
        ),
      )
      .finally(() => setReady(true));
  }, []);
  const active = demo ? demoSnapshots : snapshots;
  const accounts = [...new Set(active.map((s) => s.account))].sort();
  const actualAccount = demo
    ? 'cuenta.ejemplo'
    : accounts.includes(account)
      ? account
      : (accounts[0] ?? '');
  const benchmark =
    import.meta.env.DEV && typeof window !== 'undefined'
      ? window.__followLensWorkerE2E
      : undefined;
  const profileEnabled = benchmark?.profileEnabled === true;
  const history = useMemo(
    () =>
      active
        .filter((s) => s.account === actualAccount)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [active, actualAccount],
  );
  const current = history.find((s) => s.id === selected) ?? history.at(-1);
  const earlier = history.filter((s) => current && s.date < current.date);
  const previous = earlier.find((s) => s.id === baseline) ?? earlier.at(-1);
  const onAnalysisMeasured =
    import.meta.env.DEV && typeof window !== 'undefined'
      ? window.__followLensWorkerE2E?.recordAnalysisDuration
      : undefined;
  const data = useMemo(() => {
    if (!current) return null;
    if (importAnalysis?.snapshotId === current.id && !previous)
      return importAnalysis.data;
    return analyze(current, previous, onAnalysisMeasured);
  }, [current, previous, importAnalysis, onAnalysisMeasured]);
  const followingSet = useMemo(() => new Set(current?.following), [current]);
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const benchmark = window.__followLensWorkerE2E;
    if (!benchmark) return;
    benchmark.resetDashboard = () => {
      setSnapshots([]);
      setSavedIds([]);
      setImportAnalysis(null);
      setAccount('');
      setSelected('');
      setBaseline('');
      setDemo(false);
      setView('overview');
      setGroup('notBack');
      setQuery('');
      setOnlyFollowing(false);
      setPage(0);
      setNotice('');
      setError('');
      benchmark.operationStartedAt = null;
      benchmark.dashboardPresentedAt = null;
      benchmark.dashboardFrameAt = null;
      benchmark.dashboardSecondFrameAt = null;
      benchmark.lastDashboard = null;
      benchmark.pipelineMetrics = null;
      benchmark.profileEnabled = false;
      benchmark.reactProfiles = [];
      benchmark.derivedListSamples = [];
      benchmark.importResultReceivedAt = null;
      benchmark.stateUpdateStartedAt = null;
      benchmark.stateUpdateEnqueuedAt = null;
      benchmark.interactionStartedAt = null;
      benchmark.interactionTargetGroup = null;
      benchmark.interactionReactCommittedAt = null;
      benchmark.interactionSecondFrameAt = null;
    };
  }, []);
  useEffect(() => {
    if (!previous && changeGroups.includes(group)) setGroup('notBack');
  }, [previous, group]);
  const relevantHistory = history.filter(
    (s) => current && s.date <= current.date,
  );
  const historical = changeGroups.includes(group);
  const derivedListStartedAt =
    profileEnabled && benchmark && benchmark.operationStartedAt !== null
      ? // oxlint-disable-next-line react/react-compiler
        performance.now()
      : null;
  const visibleNames = (data?.[group] ?? []).filter(
    (n) =>
      n.includes(query.trim().replace(/^@/, '').toLowerCase()) &&
      (!onlyFollowing || followingSet.has(n)),
  );
  if (derivedListStartedAt !== null && benchmark) {
    // oxlint-disable-next-line react/react-compiler
    const derivedListEndedAt = performance.now();
    benchmark.derivedListSamples.push({
      at: derivedListEndedAt,
      durationMs: derivedListEndedAt - derivedListStartedAt,
      group,
      count: visibleNames.length,
    });
  }
  const pages = Math.max(1, Math.ceil(visibleNames.length / 12)),
    safePage = Math.min(page, pages - 1),
    shown = visibleNames.slice(safePage * 12, safePage * 12 + 12);
  const stillFollow = data?.lost.filter((n) => followingSet.has(n)) ?? [];
  function filter(g: Group) {
    setGroup(g);
    setQuery('');
    setOnlyFollowing(false);
    setPage(0);
    setView('overview');
  }
  function resetSelection() {
    setSelected('');
    setBaseline('');
    setPage(0);
    setDetail(null);
  }
  async function importSnapshot(
    s: Snapshot,
    persist: boolean,
    analysis?: Record<Group, string[]>,
  ) {
    if (
      import.meta.env.DEV &&
      benchmark?.profileEnabled &&
      benchmark.operationStartedAt !== null
    )
      benchmark.stateUpdateStartedAt = performance.now();
    if (
      snapshots.some((old) => old.account === s.account && old.date === s.date)
    )
      throw new Error(
        'Ya existe una importación de esta cuenta en esa fecha. Eliminá la anterior si querés reemplazarla.',
      );
    if (persist) {
      await saveSnapshot(s);
      setSavedIds((ids) => [...ids, s.id]);
    }
    setSnapshots((old) => [...old, s]);
    setImportAnalysis(analysis ? { snapshotId: s.id, data: analysis } : null);
    setDemo(false);
    setAccount(s.account);
    setSelected(s.id);
    setBaseline('');
    setView('overview');
    setPage(0);
    setNotice(
      persist
        ? 'Importación guardada en este navegador.'
        : 'Importación lista. Se conserva solo durante esta sesión.',
    );
    setError('');
    if (
      import.meta.env.DEV &&
      benchmark?.profileEnabled &&
      benchmark.operationStartedAt !== null
    )
      benchmark.stateUpdateEnqueuedAt = performance.now();
  }
  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      typeof window === 'undefined' ||
      !current ||
      !data
    )
      return;
    const benchmark = window.__followLensWorkerE2E;
    if (benchmark && benchmark.operationStartedAt !== null) {
      const operationStartedAt = benchmark.operationStartedAt;
      benchmark.lastDashboard = { snapshot: current, data };
      benchmark.dashboardPresentedAt = performance.now();
      let secondFrame = 0;
      const firstFrame = requestAnimationFrame(() => {
        if (benchmark.operationStartedAt !== operationStartedAt) return;
        const time = performance.now();
        benchmark.dashboardFrameAt = time;
        secondFrame = requestAnimationFrame(() => {
          if (benchmark.operationStartedAt === operationStartedAt)
            benchmark.dashboardSecondFrameAt = performance.now();
        });
      });
      return () => {
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(secondFrame);
      };
    }
  }, [current, data]);
  async function erase() {
    if (!remove) return;
    setBusy(true);
    try {
      if (savedIds.includes(remove.id)) await deleteSnapshot(remove.id);
      setSnapshots((old) => old.filter((s) => s.id !== remove.id));
      setSavedIds((ids) => ids.filter((id) => id !== remove.id));
      setRemove(null);
      setNotice('Importación eliminada de este navegador.');
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function persistOne(s: Snapshot) {
    setBusy(true);
    try {
      await saveSnapshot(s);
      setSavedIds((ids) => [...ids, s.id]);
      setNotice('Importación guardada para futuras comparaciones.');
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function downloadCSV() {
    if (!current) return;
    const blob = new Blob(
      [csvRows(visibleNames, group, current, relevantHistory)],
      { type: 'text/csv;charset=utf-8;' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `followlens-${group}-${current.date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`CSV preparado con ${count(visibleNames.length)} cuentas.`);
  }
  const modalHeader = (title: string, description: string) => (
    <>
      <DialogClose className="modal-close" aria-label="Cerrar">
        <X size={20} />
      </DialogClose>
      <DialogTitle className="modal-title">{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </>
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <ScanLine size={23} />
          </span>
          followlens<span className="brand-dot">.</span>
        </a>
        <div className="header-actions">
          <span className="privacy">
            <ShieldCheck size={16} /> Solo en tu dispositivo
          </span>
          <button
            className="icon-button"
            onClick={() => setHelpOpen(true)}
            aria-label="Cómo funciona"
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </header>
      <main className="workspace">
        {error && (
          <div className="error global-notice" role="alert">
            {error}
            <button aria-label="Cerrar aviso" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="success global-notice" role="status">
            {notice}
            <button aria-label="Cerrar aviso" onClick={() => setNotice('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {!ready ? (
          <Empty>
            <LoaderCircle className="spin" />
            <EmptyTitle>Abriendo tu espacio…</EmptyTitle>
          </Empty>
        ) : !current ? (
          <>
            <section className="welcome-hero" aria-labelledby="welcome-title">
              <div className="welcome-hero-copy">
                <div className="eyebrow">TUS RELACIONES, EN PERSPECTIVA</div>
                <h1 id="welcome-title">
                  Lo que cambia.
                  <br />
                  <span>Lo que importa.</span>
                </h1>
                <p className="intro">
                  Descubrí quién ya no te sigue, quién llegó y qué relaciones
                  siguen siendo mutuas.
                </p>
              </div>
              <HeroDemoVideo />
            </section>
            <section className="welcome-grid">
              <div className="import-card">
                <span className="icon-box">
                  <Upload />
                </span>
                <h2>Empezá con tus datos</h2>
                <p>
                  Importá tu exportación de Instagram en ZIP o archivos JSON o
                  HTML. Todo se analiza acá, en tu navegador.
                </p>
                <div className="actions">
                  <button
                    className="btn primary"
                    onClick={() => setImportOpen(true)}
                  >
                    Importar datos <ArrowUpRight size={17} />
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setDemo(true);
                      resetSelection();
                    }}
                  >
                    Explorar un ejemplo <ArrowRight size={17} />
                  </button>
                </div>
                <small>Sin contraseñas. Sin conectar tu cuenta.</small>
                <button
                  className="text-button"
                  onClick={() => setHelpOpen(true)}
                >
                  Cómo preparar mi exportación
                </button>
              </div>
              <div className="welcome-info">
                <Fingerprint size={46} />
                <h2>Tu círculo, con más claridad.</h2>
                <div>
                  <Users />
                  <span>Quién te sigue y quién no te sigue de vuelta.</span>
                </div>
                <div>
                  <ArrowLeftRight />
                  <span>Qué cambió entre dos importaciones.</span>
                </div>
                <p>
                  Con tu primer archivo ves el presente. Con el segundo empezás
                  a descubrir los cambios.
                </p>
              </div>
            </section>
          </>
        ) : (
          <>
            {demo && (
              <div className="demo-bar">
                <span>
                  <Sparkles size={16} /> Estás explorando datos ficticios. No se
                  guardan en tu historial.
                </span>
                <button
                  onClick={() => {
                    setDemo(false);
                    resetSelection();
                  }}
                >
                  Salir del ejemplo <X size={14} />
                </button>
              </div>
            )}
            <div className="dashboard-title">
              <div>
                <div className="eyebrow">TU CÍRCULO, MÁS CLARO</div>
                <h1>
                  Tus relaciones<span>.</span>
                </h1>
                <p className="subtle">
                  Un poco de perspectiva sobre las personas que te rodean.
                </p>
              </div>
              <button
                className="btn primary"
                onClick={() => setImportOpen(true)}
              >
                <Upload size={17} /> Importar datos
              </button>
            </div>
            <div className="context-bar">
              <div className="account-control">
                <span className="mini-avatar">@</span>
                <Picker
                  label="Cuenta analizada"
                  value={actualAccount}
                  onChange={(v) => {
                    setAccount(v);
                    resetSelection();
                  }}
                  items={accounts.map((a) => ({ value: a, label: `@${a}` }))}
                />
              </div>
              <div className="date-controls">
                <div>
                  <span>Importación</span>
                  <Picker
                    label="Importación actual"
                    value={current.id}
                    onChange={(v) => {
                      setSelected(v);
                      setBaseline('');
                      setPage(0);
                    }}
                    items={[...history]
                      .reverse()
                      .map((s) => ({ value: s.id, label: fmt(s.date) }))}
                  />
                </div>
                {previous && (
                  <>
                    <ArrowLeftRight size={16} />
                    <div>
                      <span>Comparar con</span>
                      <Picker
                        label="Importación anterior"
                        value={previous.id}
                        onChange={(v) => {
                          setBaseline(v);
                          setPage(0);
                        }}
                        items={[...earlier]
                          .reverse()
                          .map((s) => ({ value: s.id, label: fmt(s.date) }))}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            <Tabs value={view} onValueChange={(v) => setView(String(v))}>
              <TabsList className="main-tabs" variant="line">
                <TabsTrigger value="overview">
                  <LayoutDashboard size={16} /> Resumen
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History size={16} /> Importaciones{' '}
                  <span className="tab-count">{history.length}</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <section
                  className="stat-grid"
                  aria-label="Resumen de relaciones"
                >
                  {profileSubtree(
                    'relationship-summary',
                    profileEnabled,
                    <>
                      {(
                        [
                          { key: 'followers', icon: Users },
                          { key: 'following', icon: ArrowUpRight },
                          { key: 'mutuals', icon: ArrowLeftRight },
                        ] as const
                      ).map(({ key, icon: Icon }) => {
                        const delta = previous
                          ? data![key].length - analyze(previous)[key].length
                          : null;
                        return (
                          <button
                            className="stat-card"
                            key={key}
                            onClick={() => filter(key)}
                          >
                            <div>
                              <span>{labels[key]}</span>
                              <Icon size={18} />
                            </div>
                            <strong>{count(data![key].length)}</strong>
                            <small>
                              {delta !== null ? (
                                <>
                                  <span
                                    className={
                                      delta >= 0 ? 'positive' : 'negative'
                                    }
                                  >
                                    {delta >= 0 ? '+' : ''}
                                    {count(delta)}
                                  </span>{' '}
                                  frente a la comparación
                                </>
                              ) : (
                                'Tu punto de partida'
                              )}
                            </small>
                          </button>
                        );
                      })}
                      <button
                        className="stat-card accent-stat"
                        onClick={() => filter('notBack')}
                      >
                        <div>
                          <span>Te siguen de vuelta</span>
                          <Fingerprint size={19} />
                        </div>
                        <strong>
                          {current.following.length
                            ? `${Math.round((data!.mutuals.length / current.following.length) * 100)}%`
                            : '—'}
                        </strong>
                        <small>
                          {count(data!.mutuals.length)} de{' '}
                          {count(current.following.length)} cuentas que seguís
                        </small>
                      </button>
                    </>,
                  )}
                </section>
                <section className="insight-grid">
                  {profileSubtree(
                    'relationship-insights',
                    profileEnabled,
                    <>
                      <div className="insights">
                        <div className="section-heading">
                          <h3>
                            <Sparkles size={17} /> Vale la pena mirar
                          </h3>
                          <span className="period">
                            {previous
                              ? `${shortDate(previous.date)} — ${shortDate(current.date)}`
                              : 'Primera importación'}
                          </span>
                        </div>
                        {previous ? (
                          <>
                            <button
                              className="insight-row"
                              onClick={() => filter('lost')}
                            >
                              <span className="insight-icon pink">
                                <ArrowDownLeft size={20} />
                              </span>
                              <span>
                                <strong>
                                  {count(data!.lost.length)} seguidores ya no
                                  aparecen
                                </strong>
                                <small>
                                  A {count(stillFollow.length)} de ellos todavía
                                  los seguís.
                                </small>
                              </span>
                              <ChevronRight size={18} />
                            </button>
                            <button
                              className="insight-row"
                              onClick={() => filter('new')}
                            >
                              <span className="insight-icon green">
                                <ArrowUpRight size={20} />
                              </span>
                              <span>
                                <strong>
                                  {count(data!.new.length)} personas nuevas te
                                  siguen
                                </strong>
                                <small>
                                  No seguís de vuelta a{' '}
                                  {count(
                                    data!.new.filter(
                                      (n) => !current.following.includes(n),
                                    ).length,
                                  )}{' '}
                                  de ellas.
                                </small>
                              </span>
                              <ChevronRight size={18} />
                            </button>
                            <button
                              className="insight-row"
                              onClick={() => filter('lostMutuals')}
                            >
                              <span className="insight-icon violet">
                                <ArrowLeftRight size={20} />
                              </span>
                              <span>
                                <strong>
                                  {count(data!.lostMutuals.length)} relaciones
                                  dejaron de ser mutuas
                                </strong>
                                <small>Revisá cómo cambió cada relación.</small>
                              </span>
                              <ChevronRight size={18} />
                            </button>
                          </>
                        ) : (
                          <div className="first-import">
                            <span className="insight-icon violet">
                              <History />
                            </span>
                            <h3>Este es tu punto de partida</h3>
                            <p>
                              Importá otra fecha de esta cuenta para descubrir
                              seguidores nuevos y perdidos.
                            </p>
                            <button
                              className="text-button"
                              onClick={() => setImportOpen(true)}
                            >
                              Comparar otra importación <ArrowRight size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                      <Trend snapshots={relevantHistory} />
                    </>,
                  )}
                </section>
                <section
                  className="relationships"
                  aria-label="Listado de cuentas"
                >
                  {profileSubtree(
                    'relationship-list',
                    profileEnabled,
                    <>
                      <div className="list-heading">
                        <div>
                          <h2>Las personas detrás de los números</h2>
                          <p className="subtle">
                            Elegí una relación y explorá cada cuenta.
                          </p>
                        </div>
                        <button
                          className="btn"
                          disabled={
                            !visibleNames.length || (historical && !previous)
                          }
                          onClick={downloadCSV}
                        >
                          <Download size={16} /> Exportar CSV
                        </button>
                      </div>
                      <div className="list-controls">
                        <Picker
                          label="Filtrar relaciones"
                          value={group}
                          onChange={(v) => filter(v as Group)}
                          items={[
                            ...currentGroups,
                            ...(previous ? changeGroups : []),
                          ].map((g) => ({
                            value: g,
                            label: `${labels[g]} · ${count(data![g].length)}`,
                          }))}
                        />
                        <label className="search">
                          <Search size={17} />
                          <input
                            aria-label="Buscar por usuario"
                            placeholder="Buscar una cuenta…"
                            value={query}
                            onChange={(e) => {
                              setQuery(e.target.value);
                              setPage(0);
                            }}
                          />
                          {query && (
                            <button
                              aria-label="Limpiar búsqueda"
                              onClick={() => setQuery('')}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </label>
                        {group === 'lost' && (
                          <label className="check-row compact">
                            <Checkbox
                              checked={onlyFollowing}
                              onCheckedChange={(v) => {
                                setOnlyFollowing(v === true);
                                setPage(0);
                              }}
                            />
                            <span>Todavía los sigo</span>
                          </label>
                        )}
                      </div>
                      <div className="group-description">
                        {group === 'notBack'
                          ? 'Cuentas que seguís y que no aparecen entre tus seguidores.'
                          : group === 'fans'
                            ? 'Te siguen, pero no aparecen en tu lista de seguidos.'
                            : historical
                              ? 'Cambios observados entre las dos fechas seleccionadas.'
                              : 'Relaciones presentes en la importación seleccionada.'}
                      </div>
                      {historical && !previous ? (
                        <Empty>
                          <History />
                          <EmptyTitle>Necesitás dos importaciones</EmptyTitle>
                          <EmptyDescription>
                            Seleccioná una fecha con una importación anterior
                            para ver estos cambios.
                          </EmptyDescription>
                        </Empty>
                      ) : shown.length ? (
                        <Table className="people-table">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cuenta</TableHead>
                              <TableHead>Relación en esta fecha</TableHead>
                              <TableHead>Detectada en</TableHead>
                              <TableHead>
                                <span className="sr-only">Detalle</span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {shown.map((name) => (
                              <TableRow key={name}>
                                <TableCell>
                                  <button
                                    className="person"
                                    onClick={() => setDetail(name)}
                                  >
                                    <Avatar name={name} />
                                    <strong>@{name}</strong>
                                  </button>
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`status-pill ${relationship(current, name) === 'Mutuos' ? 'green' : current.following.includes(name) ? 'violet' : ''}`}
                                  >
                                    {current.following.includes(name) && (
                                      <Check size={12} />
                                    )}{' '}
                                    {relationship(current, name)}
                                  </span>
                                </TableCell>
                                <TableCell className="muted-cell">
                                  {historical
                                    ? fmt(current.date)
                                    : fmt(
                                        relevantHistory.find(
                                          (s) =>
                                            s.followers.includes(name) ||
                                            s.following.includes(name),
                                        )?.date ?? current.date,
                                      )}
                                </TableCell>
                                <TableCell>
                                  <button
                                    className="icon-button"
                                    aria-label={`Ver historial de ${name}`}
                                    onClick={() => setDetail(name)}
                                  >
                                    <ChevronRight size={18} />
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <Empty>
                          <Search />
                          <EmptyTitle>
                            {query
                              ? 'No encontramos esa cuenta'
                              : 'No hay cuentas en este grupo'}
                          </EmptyTitle>
                          <EmptyDescription>
                            {query
                              ? 'Probá con otro usuario o cambiá el filtro.'
                              : 'Este resultado corresponde a las fechas seleccionadas.'}
                          </EmptyDescription>
                        </Empty>
                      )}
                      <div className="table-footer">
                        <span>
                          {visibleNames.length
                            ? `${safePage * 12 + 1}–${Math.min((safePage + 1) * 12, visibleNames.length)} de ${count(visibleNames.length)} cuentas`
                            : '0 cuentas'}
                        </span>
                        <nav aria-label="Paginación de cuentas">
                          <button
                            className="icon-button"
                            aria-label="Página anterior"
                            disabled={safePage === 0}
                            onClick={() => setPage(safePage - 1)}
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <span>
                            {safePage + 1} / {pages}
                          </span>
                          <button
                            className="icon-button"
                            aria-label="Página siguiente"
                            disabled={safePage >= pages - 1}
                            onClick={() => setPage(safePage + 1)}
                          >
                            <ChevronRight size={18} />
                          </button>
                        </nav>
                      </div>
                    </>,
                  )}
                </section>
                <p className="data-note">
                  <ShieldCheck size={15} /> Los cambios se detectan entre
                  exportaciones: no indican el momento exacto ni el motivo. Un
                  cambio de usuario o una cuenta desactivada también puede
                  aparecer como una pérdida.
                </p>
              </TabsContent>
              <TabsContent value="history">
                <section className="history-panel">
                  <div className="list-heading">
                    <div>
                      <h2>Tu historial, en este navegador</h2>
                      <p className="subtle">
                        Cada importación es una foto de tus relaciones en una
                        fecha.
                      </p>
                    </div>
                  </div>
                  {[...history].reverse().map((s) => (
                    <div className="history-row" key={s.id}>
                      <span className="insight-icon violet">
                        <History size={20} />
                      </span>
                      <div>
                        <strong>{fmt(s.date)}</strong>
                        <small>
                          {count(s.followers.length)} seguidores ·{' '}
                          {count(s.following.length)} seguidos
                        </small>
                      </div>
                      <span className="storage-tag">
                        {demo
                          ? 'Ejemplo'
                          : savedIds.includes(s.id)
                            ? 'Guardada localmente'
                            : 'Solo esta sesión'}
                      </span>
                      <div className="actions">
                        <button
                          className="btn"
                          onClick={() => {
                            setSelected(s.id);
                            setBaseline('');
                            setView('overview');
                            setPage(0);
                          }}
                        >
                          Ver
                        </button>
                        {!demo && !savedIds.includes(s.id) && (
                          <button
                            className="btn"
                            disabled={busy}
                            onClick={() => persistOne(s)}
                          >
                            Guardar
                          </button>
                        )}
                        {!demo && (
                          <button
                            className="icon-button danger"
                            aria-label={`Eliminar importación del ${fmt(s.date)}`}
                            onClick={() => setRemove(s)}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="data-note">
                    El historial no se sincroniza entre dispositivos. Si borrás
                    los datos del navegador, perdés las importaciones guardadas;
                    conservá tus archivos originales.
                  </p>
                </section>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
      <footer>
        FollowLens · Una herramienta independiente de Instagram.
        <button onClick={() => setHelpOpen(true)}>
          Tus datos siguen siendo tuyos <ArrowUpRight size={12} />
        </button>
      </footer>
      {importOpen && (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImport={importSnapshot}
          account={demo ? '' : actualAccount}
          processFiles={
            import.meta.env.DEV && typeof window !== 'undefined'
              ? window.__followLensWorkerE2E?.processFiles
              : undefined
          }
        />
      )}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="modal" showCloseButton={false}>
          {modalHeader(
            'Tus datos, paso a paso',
            'Solo necesitás la exportación oficial de Instagram.',
          )}
          <ol className="help-steps">
            <li>
              <strong>Prepará una exportación</strong>
              <p>
                En las opciones de tu cuenta, buscá la descarga o exportación de
                tu información.
              </p>
            </li>
            <li>
              <strong>Elegí seguidores y seguidos</strong>
              <p>
                Elegí formato JSON o HTML y período Todo el tiempo. Incluí todas
                las partes de seguidores y usá el mismo formato para seguidores
                y seguidos.
              </p>
            </li>
            <li>
              <strong>Importá el ZIP o los archivos individuales</strong>
              <p>
                El ZIP puede contener los datos en JSON o HTML. También podés
                seleccionar archivos JSON o HTML individuales, sin mezclar
                formatos. Indicá la cuenta y la fecha a la que corresponden los
                datos. Para ver cambios, importá dos fechas de la misma cuenta.
              </p>
            </li>
          </ol>
          <div className="help-privacy">
            <ShieldCheck />
            <div>
              <strong>El análisis ocurre en tu navegador</strong>
              <p>
                No leemos mensajes, fotos ni contraseñas. Guardar el historial
                es opcional y solo lo conserva en este navegador.
              </p>
            </div>
          </div>
          <p className="subtle">
            No podemos determinar por qué desapareció una cuenta ni qué ocurrió
            entre dos exportaciones. El historial muestra observaciones, no
            fechas exactas de seguimiento.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
      >
        <DialogContent className="modal" showCloseButton={false}>
          {detail && current && (
            <>
              {modalHeader(
                `@${detail}`,
                'Historial observado hasta la importación seleccionada.',
              )}
              <div className="profile-summary">
                <Avatar name={detail} />
                <div>
                  <strong>{relationship(current, detail)}</strong>
                  <small>{fmt(current.date)}</small>
                </div>
                <a
                  className="btn"
                  href={`https://www.instagram.com/${encodeURIComponent(detail)}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver perfil <ArrowUpRight size={15} />
                </a>
              </div>
              <div className="relationship-facts">
                <span>
                  Te sigue{' '}
                  <strong>
                    {current.followers.includes(detail) ? 'Sí' : 'No'}
                  </strong>
                </span>
                <span>
                  Lo seguís{' '}
                  <strong>
                    {current.following.includes(detail) ? 'Sí' : 'No'}
                  </strong>
                </span>
              </div>
              <h3>Cambios detectados</h3>
              <ol className="timeline">
                {timeline(relevantHistory, detail).map((item, i) => (
                  <li key={i}>
                    <span className="timeline-dot" />
                    <div>
                      <small>{fmt(item.date)}</small>
                      <strong>{item.state}</strong>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="subtle">
                La primera observación no equivale al inicio de la relación. Las
                fechas corresponden a tus exportaciones.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!remove}
        onOpenChange={(v) => {
          if (!v && !busy) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>¿Eliminar esta importación?</AlertDialogTitle>
          <AlertDialogDescription>
            {remove &&
              `Se eliminará la importación del ${fmt(remove.date)} de @${remove.account} en este navegador. Podés volver a importar el archivo original.`}
          </AlertDialogDescription>
          <div className="actions">
            <AlertDialogCancel disabled={busy}>Conservar</AlertDialogCancel>
            <button className="btn danger" disabled={busy} onClick={erase}>
              {busy ? 'Eliminando…' : 'Eliminar importación'}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
