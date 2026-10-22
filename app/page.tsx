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
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  UserRoundX,
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
import { ThemeToggle } from '@/components/theme-toggle';
import {
  analyze,
  csvRows,
  labels,
  relationship,
  timeline,
  type Group,
  type Snapshot,
} from '@/lib/relationships';
import {
  getSnapshots,
  getUnavailableProfiles,
  saveSnapshot,
  saveUnavailableProfiles,
  deleteSnapshot,
} from '@/lib/storage';
import {
  excludedUnavailableProfiles as getExcludedUnavailableProfiles,
  isUnavailableProfileExcluded,
  mergeDetectedUnavailableProfiles,
  parseUnavailableUsernames,
  withoutUnavailableProfiles,
  type UnavailableProfile,
} from '@/lib/profile-availability';
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
const EMPTY_UNAVAILABLE_PROFILES: UnavailableProfile[] = [];
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
                <stop offset="0%" stopColor="var(--primary)" stopOpacity=".18" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[26, 76, 126].map((y) => (
              <line
                key={y}
                x1="30"
                x2="490"
                y1={y}
                y2={y}
                stroke="var(--trend-grid)"
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
              stroke="var(--primary)"
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
                    fill="var(--card)"
                    stroke="var(--primary)"
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
    [unavailableProfiles, setUnavailableProfiles] = useState<UnavailableProfile[]>([]),
    [availabilityAccount, setAvailabilityAccount] = useState(''),
    [excludeUnavailableFor, setExcludeUnavailableFor] = useState(''),
    [availabilityOpen, setAvailabilityOpen] = useState(false),
    [availabilityInput, setAvailabilityInput] = useState(''),
    [availabilityReason, setAvailabilityReason] = useState(''),
    [availabilityError, setAvailabilityError] = useState(''),
    [availabilityBusy, setAvailabilityBusy] = useState(false),
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
  const excludeUnavailable =
    !!actualAccount && excludeUnavailableFor === actualAccount;
  const currentUnavailableProfiles =
    availabilityAccount === actualAccount
      ? unavailableProfiles
      : EMPTY_UNAVAILABLE_PROFILES;
  const profilesToExclude = useMemo(
    () => getExcludedUnavailableProfiles(currentUnavailableProfiles),
    [currentUnavailableProfiles],
  );
  useEffect(() => {
    let cancelled = false;
    if (!actualAccount || demo) return;
    getUnavailableProfiles(actualAccount)
      .then((profiles) => {
        if (!cancelled) {
          setUnavailableProfiles(profiles);
          setAvailabilityAccount(actualAccount);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(`${err.message} Las marcas de disponibilidad no están disponibles.`);
      });
    return () => {
      cancelled = true;
    };
  }, [actualAccount, demo]);
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
  const analysisCurrent = useMemo(
    () =>
      current && excludeUnavailable
        ? withoutUnavailableProfiles(
            current,
            new Set(profilesToExclude.map((profile) => profile.username)),
          )
        : current,
    // oxlint-disable-next-line react/react-compiler
    [current, excludeUnavailable, profilesToExclude],
  );
  const analysisPrevious = useMemo(
    () =>
      previous && excludeUnavailable
        ? withoutUnavailableProfiles(
            previous,
            new Set(profilesToExclude.map((profile) => profile.username)),
          )
        : previous,
    // oxlint-disable-next-line react/react-compiler
    [previous, excludeUnavailable, profilesToExclude],
  );
  const onAnalysisMeasured =
    import.meta.env.DEV && typeof window !== 'undefined'
      ? window.__followLensWorkerE2E?.recordAnalysisDuration
      : undefined;
  const data = useMemo(() => {
    if (!analysisCurrent) return null;
    if (
      !excludeUnavailable &&
      importAnalysis?.snapshotId === analysisCurrent.id &&
      !analysisPrevious
    )
      return importAnalysis.data;
    return analyze(analysisCurrent, analysisPrevious, onAnalysisMeasured);
  }, [analysisCurrent, analysisPrevious, excludeUnavailable, importAnalysis, onAnalysisMeasured]);
  const followingSet = useMemo(
    () => new Set(analysisCurrent?.following),
    [analysisCurrent],
  );
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const benchmark = window.__followLensWorkerE2E;
    if (!benchmark) return;
    benchmark.resetDashboard = () => {
      setSnapshots([]);
      setSavedIds([]);
      setImportAnalysis(null);
      setAccount('');
      setExcludeUnavailableFor('');
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
  const relevantHistory = history.filter((s) => current && s.date <= current.date);
  // oxlint-disable-next-line react/react-compiler
  const analysisHistory = useMemo(
    () => {
      const relevant = history.filter((s) => current && s.date <= current.date);
      if (!excludeUnavailable) return relevant;
      const unavailableSet = new Set(
        profilesToExclude.map((profile) => profile.username),
      );
      return relevant.map((snapshot) =>
        withoutUnavailableProfiles(snapshot, unavailableSet),
      );
    },
    // oxlint-disable-next-line react/react-compiler
    [history, current, excludeUnavailable, profilesToExclude],
  );
  const displayHistory = useMemo(
    () => {
      if (!excludeUnavailable) return history;
      const unavailableSet = new Set(
        profilesToExclude.map((profile) => profile.username),
      );
      return history.map((snapshot) =>
        withoutUnavailableProfiles(snapshot, unavailableSet),
      );
    },
    [history, excludeUnavailable, profilesToExclude],
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
  async function persistAvailability(profiles: UnavailableProfile[]) {
    if (!actualAccount || demo) return false;
    setAvailabilityBusy(true);
    try {
      await saveUnavailableProfiles(actualAccount, profiles);
      setUnavailableProfiles(profiles);
      setAvailabilityAccount(actualAccount);
      setAvailabilityError('');
      setNotice('La lista local de perfiles identificados fue actualizada.');
      return true;
    } catch (err) {
      const message = (err as Error).message;
      setAvailabilityError(message);
      setError(message);
      return false;
    } finally {
      setAvailabilityBusy(false);
    }
  }
  function toggleUnavailableProfile(username: string) {
    const existing = currentUnavailableProfiles.find(
      (profile) => profile.username === username,
    );
    let next: UnavailableProfile[];
    if (!existing) {
      next = [
        ...currentUnavailableProfiles,
        {
          username,
          reason: 'Identificado por vos',
          source: 'manual' as const,
          isExcluded: true,
        },
      ];
    } else if (!isUnavailableProfileExcluded(existing)) {
      next = currentUnavailableProfiles.map((profile) =>
        profile.username === username
          ? { ...profile, source: 'manual' as const, isExcluded: true }
          : profile,
      );
    } else if (existing.source === 'automatic') {
      next = currentUnavailableProfiles.map((profile) =>
        profile.username === username
          ? {
              ...profile,
              source: 'manual' as const,
              isExcluded: false,
              reason: 'Clasificación corregida por vos',
            }
          : profile,
      );
    } else {
      next = currentUnavailableProfiles.filter(
        (profile) => profile.username !== username,
      );
    }
    void persistAvailability(
      next.sort((a, b) => a.username.localeCompare(b.username)),
    );
  }
  function forgetUnavailableProfile(username: string) {
    void persistAvailability(
      currentUnavailableProfiles.filter(
        (profile) => profile.username !== username,
      ),
    );
  }
  function profileAvailabilityDescription(username: string) {
    const profile = currentUnavailableProfiles.find(
      (item) => item.username === username,
    );
    if (!profile) return 'Historial observado hasta la importación seleccionada.';
    if (!isUnavailableProfileExcluded(profile))
      return 'Clasificación corregida por vos: esta cuenta se incluirá en el análisis.';
    const origin =
      profile.source === 'automatic'
        ? 'Detectado por FollowLens'
        : 'Identificado por vos';
    return `${origin}. Motivo: ${profile.reason}.`;
  }
  function updateAvailabilityReason(username: string, reason: string) {
    setUnavailableProfiles((profiles) =>
      profiles.map((profile) =>
        profile.username === username
          ? { ...profile, reason, source: 'manual' }
          : profile,
      ),
    );
  }
  function saveAvailabilityReason(username: string, reason: string) {
    const next = currentUnavailableProfiles.map((profile) =>
      profile.username === username
        ? {
            ...profile,
            reason: reason.trim() || 'Identificado por vos',
            source: 'manual' as const,
          }
        : profile,
    );
    void persistAvailability(next);
  }
  async function addUnavailableProfiles() {
    const parsed = parseUnavailableUsernames(availabilityInput);
    if (!parsed.usernames.length || parsed.invalid.length) {
      setAvailabilityError(
        parsed.invalid.length
          ? `No reconocimos estos nombres: ${parsed.invalid.join(', ')}`
          : 'Pegá al menos un nombre de usuario.',
      );
      return;
    }
    const merged = new Map(
      currentUnavailableProfiles.map((profile) => [profile.username, profile]),
    );
    for (const username of parsed.usernames) {
      const existing = merged.get(username);
      merged.set(username, {
        username,
        reason:
          availabilityReason.trim() ||
          (existing?.source === 'automatic'
            ? 'Identificado por vos'
            : existing?.reason || 'Identificado por vos'),
        source: 'manual' as const,
        isExcluded: true,
      });
    }
    const saved = await persistAvailability(
      [...merged.values()].sort((a, b) => a.username.localeCompare(b.username)),
    );
    if (saved) {
      setAvailabilityInput('');
      setAvailabilityReason('');
    }
  }
  async function importSnapshot(
    s: Snapshot,
    persist: boolean,
    analysis?: Record<Group, string[]>,
    detectedUnavailableProfiles: string[] = [],
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
    let automaticDetectionError = '';
    if (detectedUnavailableProfiles.length) {
      try {
        const existing =
          availabilityAccount === s.account
            ? unavailableProfiles
            : await getUnavailableProfiles(s.account);
        const merged = mergeDetectedUnavailableProfiles(
          existing,
          detectedUnavailableProfiles,
        );
        await saveUnavailableProfiles(s.account, merged);
        setUnavailableProfiles(merged);
        setAvailabilityAccount(s.account);
      } catch {
        automaticDetectionError =
          'FollowLens detectó marcadores de cuentas eliminadas, pero no pudo guardar la lista local en este navegador.';
      }
    }
    setSnapshots((old) => [...old, s]);
    setImportAnalysis(analysis ? { snapshotId: s.id, data: analysis } : null);
    setDemo(false);
    setAccount(s.account);
    setExcludeUnavailableFor('');
    setSelected(s.id);
    setBaseline('');
    setView('overview');
    setPage(0);
    const importNotice = persist
      ? 'Importación guardada en este navegador.'
      : 'Importación lista. Se conserva solo durante esta sesión.';
    setNotice(
      detectedUnavailableProfiles.length
        ? `${importNotice} FollowLens detectó ${count(detectedUnavailableProfiles.length)} marcador${detectedUnavailableProfiles.length === 1 ? '' : 'es'} explícito${detectedUnavailableProfiles.length === 1 ? '' : 's'} de cuenta eliminada.`
        : importNotice,
    );
    setError(automaticDetectionError);
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
      [csvRows(visibleNames, group, analysisCurrent!, analysisHistory)],
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
            <svg
              viewBox="0 0 24 24"
              width={24}
              height={24}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <path d="M7 12h10" />
            </svg>
          </span>
          followlens<span className="brand-dot">.</span>
        </a>
        <div className="header-actions">
          <span className="privacy">
            <ShieldCheck size={16} /> Solo en tu dispositivo
          </span>
          <ThemeToggle />
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
                    setExcludeUnavailableFor('');
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
            <section className="availability-control" aria-label="Filtro de disponibilidad">
              <div className="check-row">
                <Checkbox
                  aria-label="Excluir perfiles identificados como no disponibles"
                  checked={excludeUnavailable}
                  disabled={demo || profilesToExclude.length === 0}
                  onCheckedChange={(value) => {
                    setExcludeUnavailableFor(value === true ? actualAccount : '');
                    setPage(0);
                  }}
                />
                <span>
                  Excluir perfiles identificados como no disponibles
                  <small>
                    {profilesToExclude.length
                      ? `${count(profilesToExclude.length)} marcas locales para @${actualAccount}`
                      : 'Detección limitada a marcadores explícitos; las demás marcas son manuales.'}
                  </small>
                </span>
              </div>
              <button
                className="btn"
                disabled={demo || availabilityBusy}
                onClick={() => {
                  setAvailabilityInput('');
                  setAvailabilityReason('');
                  setAvailabilityError('');
                  setAvailabilityOpen(true);
                }}
              >
                <UserRoundX size={16} /> Gestionar perfiles
              </button>
            </section>
            <Tabs value={view} onValueChange={(v) => setView(String(v))}>
              <TabsList className="main-tabs" variant="line">
                <TabsTrigger value="overview">
                  <LayoutDashboard size={16} /> Resumen
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History size={16} /> Importaciones
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
                        const delta = analysisPrevious
                          ? data![key].length - analyze(analysisPrevious)[key].length
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
                        onClick={() => filter('mutuals')}
                      >
                        <div>
                          <span>Te siguen de vuelta</span>
                          <Fingerprint size={19} />
                        </div>
                        <strong>
                          {analysisCurrent!.following.length
                            ? `${Math.round((data!.mutuals.length / analysisCurrent!.following.length) * 100)}%`
                            : '—'}
                        </strong>
                        <small>
                          {count(data!.mutuals.length)} de{' '}
                          {count(analysisCurrent!.following.length)} cuentas que seguís
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
                                      (n) => !analysisCurrent!.following.includes(n),
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
                      <Trend snapshots={analysisHistory} />
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
                              <TableHead>Marca local</TableHead>
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
                                    className={`status-pill ${relationship(analysisCurrent!, name) === 'Mutuos' ? 'green' : analysisCurrent!.following.includes(name) ? 'violet' : ''}`}
                                  >
                                    {analysisCurrent!.following.includes(name) && (
                                      <Check size={12} />
                                    )}{' '}
                                    {relationship(analysisCurrent!, name)}
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
                                    aria-label={`${profilesToExclude.some((profile) => profile.username === name) ? 'Corregir clasificación de' : 'Marcar'} ${name} como no disponible`}
                                    title={profilesToExclude.some((profile) => profile.username === name) ? 'Incluir en el análisis' : 'Marcar como no disponible'}
                                    aria-pressed={profilesToExclude.some((profile) => profile.username === name)}
                                    data-marked={profilesToExclude.some((profile) => profile.username === name)}
                                    disabled={availabilityBusy || demo}
                                    onClick={() => toggleUnavailableProfile(name)}
                                  >
                                    <UserRoundX size={16} />
                                  </button>
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
                  exportaciones: no indican el momento exacto ni el motivo. Una
                  cuenta que desaparece puede haber cambiado de usuario, estar
                  suspendida o ya no seguirte. Las marcas de disponibilidad son
                  manuales y no prueban el estado de una cuenta.
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
                  {[...displayHistory].reverse().map((s) => (
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
        <DialogContent
          className="modal export-guide-modal"
          showCloseButton={false}
        >
          {modalHeader(
            'Guía de exportación de Instagram',
            'Seguí estos pasos para descargar tu información oficial e importarla en FollowLens.',
          )}
          <div className="export-guide-scroll">
            <ol className="help-steps">
              <li>
                <strong>Entrar en el Centro de cuentas</strong>
                <p>
                  Desde Instagram, accedé a{' '}
                  <strong>
                    Configuración → Centro de cuentas → Tu información y permisos
                  </strong>
                  . Esta sección permite gestionar la información de tu cuenta y
                  acceder a las opciones de exportación.
                </p>
              </li>
              <li>
                <strong>Crear una exportación</strong>
                <p>
                  Seleccioná <strong>«Exportar tu información»</strong> y creá una
                  exportación correspondiente a la cuenta de Instagram que deseás
                  analizar. Podés elegir entre dos alternativas para recibir el
                  archivo:
                </p>
                <p>
                  • <strong>Exportar al dispositivo:</strong> opción recomendada
                  para descargar el archivo directamente en tu equipo.
                  <br />• <strong>Un servicio externo, como Google Drive:</strong>{' '}
                  alternativa opcional si disponés de esa integración (la copia
                  queda sujeta a las condiciones de almacenamiento y privacidad de
                  dicho servicio).
                </p>
              </li>
              <li>
                <strong>Personalizar la información</strong>
                <p>
                  Dentro de las opciones de exportación, seleccioná{' '}
                  <strong>«Personalizar información»</strong>.
                </p>
                <p>
                  Para FollowLens únicamente necesitás marcar la categoría:{' '}
                  <strong>«Seguidores y seguidos»</strong>. No es necesario
                  incluir el resto de las categorías de la cuenta. Seleccionar solo
                  esta información hace que la exportación sea más liviana y evita
                  incluir datos que la aplicación no necesita.
                </p>
              </li>
              <li>
                <strong>Elegir el intervalo de fechas</strong>
                <p>
                  Recomendamos seleccionar el intervalo más amplio disponible,
                  desde el principio de la actividad o{' '}
                  <strong>«Todo el tiempo»</strong>, según figure en la pantalla
                  de Instagram.
                </p>
                <p>
                  Elegir el intervalo completo minimiza el riesgo de analizar una
                  lista parcial por haber limitado el período. Tené en cuenta que
                  este rango no indica la fecha exacta en que una persona comenzó a
                  seguirte o la seguiste, sino el lapso de datos abarcado por la
                  exportación.
                </p>
              </li>
              <li>
                <strong>Elegir el formato</strong>
                <p>
                  Recomendamos <strong>JSON</strong> como primera opción por ser el
                  formato estructurado ideal para este flujo. FollowLens también
                  admite exportaciones en <strong>HTML</strong> si preferís esa
                  alternativa.
                </p>
              </li>
              <li>
                <strong>Calidad multimedia (opcional)</strong>
                <p>
                  Si Instagram te presenta una opción de calidad multimedia,
                  recomendamos seleccionar <strong>«Baja»</strong>. No necesitás
                  fotografías ni vídeos para analizar relaciones, y esta opción no
                  influye en los cálculos de FollowLens. Si la opción no aparece en
                  tu pantalla, podés continuar sin problemas.
                </p>
              </li>
              <li>
                <strong>Esperar y descargar el archivo</strong>
                <p>
                  Confirmá la solicitud de exportación y seguí las instrucciones
                  que Instagram muestre en pantalla. La preparación puede tardar un
                  momento. Cuando esté lista, descargá el archivo{' '}
                  <strong>ZIP</strong> y localizalo en tu dispositivo o servicio
                  en la nube.
                </p>
              </li>
              <li>
                <strong>Importar en FollowLens</strong>
                <p>
                  Con el archivo descargado, volvé a FollowLens y seleccioná{' '}
                  <strong>«Importar datos»</strong>. Podés cargar directamente el
                  archivo <strong>ZIP</strong> oficial sin descomprimirlo
                  manualmente.
                </p>
                <p>
                  Como alternativa, también podés seleccionar los archivos
                  relacionales individuales (en este caso, asegurate de incluir
                  todas las partes consecutivas de seguidores y el archivo de
                  seguidos, utilizando un único formato: JSON o HTML, sin
                  mezclarlos).
                </p>
                <p>
                  Indicá el nombre de usuario de la cuenta y la fecha a la que
                  corresponde la exportación. Para comparar cambios históricos y
                  detectar unfollows o nuevos seguidores, importá exportaciones de
                  fechas distintas de la misma cuenta.
                </p>
              </li>
            </ol>
            <div className="help-privacy">
              <ShieldCheck />
              <div>
                <strong>100% privado y en tu navegador</strong>
                <p>
                  El análisis ocurre localmente en tu navegador. FollowLens no
                  necesita tu contraseña ni pide conectar tu cuenta de Instagram.
                  La aplicación extrae selectivamente los archivos de relaciones
                  del ZIP; no procesa mensajes privados, fotografías ni vídeos.
                  El historial es opcional y solo se conserva en el almacenamiento
                  local de este navegador.
                </p>
              </div>
            </div>
            <p className="subtle">
              Una exportación representa una observación puntual de tus relaciones
              en el período correspondiente. No permite determinar por qué
              desapareció una cuenta ni conocer la fecha exacta de un seguimiento o
              de un unfollow entre exportaciones. Las comparaciones históricas
              requieren exportaciones de fechas distintas de la misma cuenta.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={availabilityOpen}
        onOpenChange={(value) => {
          if (!value) setAvailabilityOpen(false);
        }}
      >
        <DialogContent className="modal" showCloseButton={false}>
          {modalHeader(
            'Perfiles identificados como no disponibles',
            'FollowLens detecta marcadores explícitos de cuentas eliminadas en la exportación. También podés agregar perfiles y corregir cualquier clasificación. Todo queda en este navegador.',
          )}
          <label className="availability-input">
            Agregar nombres de usuario
            <textarea
              rows={4}
              placeholder="@cuenta1, cuenta2…"
              value={availabilityInput}
              onChange={(event) => {
                setAvailabilityInput(event.target.value);
                setAvailabilityError('');
              }}
            />
          </label>
          <label className="availability-input">
            Motivo (opcional, para todos los nombres que agregues)
            <input
              value={availabilityReason}
              onChange={(event) => setAvailabilityReason(event.target.value)}
              placeholder="Por ejemplo: perfil suspendido"
            />
          </label>
          <small className="subtle">
            Podés pegarlos separados por espacios, comas o saltos de línea. La
            detección automática reconoce el marcador explícito <code>__deleted__</code>;
            no consulta Instagram ni confirma suspensiones o desactivaciones que
            no estén indicadas en la exportación.
          </small>
          {availabilityError && (
            <p className="error" role="alert">{availabilityError}</p>
          )}
          <button
            className="btn primary"
            disabled={availabilityBusy || !availabilityInput.trim()}
            onClick={() => void addUnavailableProfiles()}
          >
            {availabilityBusy ? 'Guardando…' : 'Agregar a la lista'}
          </button>
          <div className="availability-list" aria-label="Perfiles marcados">
            {currentUnavailableProfiles.length ? (
              currentUnavailableProfiles.map((profile) => {
                const isExcluded = isUnavailableProfileExcluded(profile);
                const source =
                  profile.source === 'automatic'
                    ? 'Detectado por FollowLens'
                    : 'Identificado por vos';
                return (
                  <div className="availability-row" key={profile.username}>
                    <span>
                      <strong>@{profile.username}</strong>
                      <small>
                        {source}
                        {isExcluded
                          ? ''
                          : ' · Corregido por vos: se incluirá en el análisis'}
                      </small>
                      <input
                        aria-label={`Motivo de la marca para ${profile.username}`}
                        value={profile.reason}
                        onChange={(event) =>
                          updateAvailabilityReason(profile.username, event.target.value)
                        }
                        onBlur={(event) =>
                          saveAvailabilityReason(profile.username, event.target.value)
                        }
                      />
                    </span>
                    <button
                      className="btn"
                      aria-label={
                        isExcluded
                          ? `Incluir ${profile.username} en el análisis`
                          : `Volver a excluir ${profile.username}`
                      }
                      disabled={availabilityBusy}
                      onClick={() => toggleUnavailableProfile(profile.username)}
                    >
                      {isExcluded ? 'Incluir' : 'Excluir'}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Quitar clasificación de ${profile.username}`}
                      title="Quitar de la lista local"
                      disabled={availabilityBusy}
                      onClick={() => forgetUnavailableProfile(profile.username)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="subtle">Todavía no hay perfiles identificados.</p>
            )}
          </div>
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
                profileAvailabilityDescription(detail),
              )}
              <div className="profile-summary">
                <Avatar name={detail} />
                <div>
                  <strong>{relationship(analysisCurrent!, detail)}</strong>
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
                    {analysisCurrent!.followers.includes(detail) ? 'Sí' : 'No'}
                  </strong>
                </span>
                <span>
                  Lo seguís{' '}
                  <strong>
                    {analysisCurrent!.following.includes(detail) ? 'Sí' : 'No'}
                  </strong>
                </span>
              </div>
              <h3>Cambios detectados</h3>
              <ol className="timeline">
                {timeline(analysisHistory, detail).map((item, i) => (
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
