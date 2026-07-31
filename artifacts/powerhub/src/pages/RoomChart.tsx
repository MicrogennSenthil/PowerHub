import { useMemo, useState, useEffect } from 'react';
import {
  useGetRoomChart,
  getGetRoomChartQueryKey,
  useListDevices,
  getListDevicesQueryKey,
  useSyncHmsStatus,
  RoomChartRoom,
  RoomChartControl,
} from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Lightbulb,
  Wind,
  Flame,
  Power,
  RefreshCw,
  Loader2,
  DoorClosed,
  Wifi,
  WifiOff,
  Search,
  Activity,
  Zap,
  AlertTriangle,
  LogIn,
  LogOut,
  Sparkles,
  Users,
  ArrowRightLeft,
  UserCheck,
  Timer,
  MousePointer,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';

// Compact "how long ago" for device last-seen times.
function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// One chip per relay box: green = polling the server, red = silent.
function DeviceStatusStrip({ propertyId }: { propertyId: number }) {
  const { data: devices } = useListDevices(
    { propertyId },
    {
      query: {
        queryKey: getListDevicesQueryKey({ propertyId }),
        refetchInterval: 10000,
      },
    },
  );

  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem('powerhub-hubs-strip') !== 'collapsed'; }
    catch { return true; }
  });

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem('powerhub-hubs-strip', next ? 'expanded' : 'collapsed'); }
    catch { /* ignore */ }
  };

  if (!devices || devices.length === 0) return null;

  const offlineCount = devices.filter(d => !d.online).length;

  return (
    <div className="mt-4 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 overflow-hidden">
      {/* Header row — always visible, acts as the toggle */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100/70 dark:hover:bg-gray-700/50 transition-colors text-left"
      >
        <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Hubs</span>

        {/* Offline badge stays visible even when collapsed */}
        {offlineCount > 0 && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive border border-destructive/20 text-[10px] font-bold animate-pulse ml-1">
            <AlertTriangle className="h-3 w-3" />
            {offlineCount} Offline
          </div>
        )}

        <span className="ml-auto text-gray-400 dark:text-gray-500">
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Collapsible device pills */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          {devices.map((d) => (
            <div
              key={d.id}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors duration-300 cursor-default hover-elevate',
                d.online
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-destructive/30 bg-destructive/10 text-destructive',
              )}
              title={
                d.online
                  ? `Box ${d.code} online — last poll ${timeAgo(d.lastSeenAt)} ago`
                  : `Box ${d.code} OFFLINE — last poll ${timeAgo(d.lastSeenAt)} ago`
              }
            >
              {d.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span>{d.code}</span>
              <span className="text-[10px] opacity-70 ml-1 font-mono">{timeAgo(d.lastSeenAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const NO_BLOCK = '__no_block__';
const NO_FLOOR = '__no_floor__';

// Natural sort so "10" sorts after "9" instead of after "1".
function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Map an MHMS event/process name to an icon + colour.
function processConfig(name: string | null | undefined): {
  Icon: React.ElementType;
  label: string;
  color: string;
} {
  const n = (name ?? '').toLowerCase();
  if (n.includes('checkin') || n.includes('check-in') || n.includes('walkin') || n.includes('walk-in'))
    return { Icon: LogIn,           label: name!,  color: 'text-green-600 bg-green-50 border-green-200' };
  if (n.includes('checkout') || n.includes('check-out'))
    return { Icon: LogOut,          label: name!,  color: 'text-red-600 bg-red-50 border-red-200' };
  if (n.includes('clean'))
    return { Icon: Sparkles,        label: name!,  color: 'text-blue-600 bg-blue-50 border-blue-200' };
  if (n.includes('visit'))
    return { Icon: Users,           label: name!,  color: 'text-purple-600 bg-purple-50 border-purple-200' };
  if (n.includes('transfer'))
    return { Icon: ArrowRightLeft,  label: name!,  color: 'text-orange-600 bg-orange-50 border-orange-200' };
  if (n.includes('group'))
    return { Icon: UserCheck,       label: name!,  color: 'text-teal-600 bg-teal-50 border-teal-200' };
  if (n.includes('auto') || n.includes('cutoff'))
    return { Icon: Timer,           label: name!,  color: 'text-gray-600 bg-gray-50 border-gray-200' };
  if (name)
    return { Icon: MousePointer,    label: name,   color: 'text-gray-600 bg-gray-50 border-gray-200' };
  return { Icon: MousePointer, label: 'Manual', color: 'text-gray-500 bg-gray-50 border-gray-200' };
}

// Map a control type name to an icon. Falls back to a generic power icon.
function controlIcon(name: string | null | undefined) {
  const n = (name ?? '').toLowerCase();
  if (n.includes('light') || n.includes('lamp') || n.includes('bulb')) return Lightbulb;
  if (n.includes('ac') || n.includes('air') || n.includes('cond') || n.includes('cool') || n.includes('fan')) return Wind;
  if (n.includes('gey') || n.includes('geez') || n.includes('heat') || n.includes('water') || n.includes('boiler')) return Flame;
  return Power;
}

function ControlChip({ control }: { control: RoomChartControl }) {
  const Icon = controlIcon(control.controlTypeName);
  const name = control.controlTypeName || control.label || 'Control';
  const offline = !control.deviceOnline;
  const on = control.on;

  const cls = offline
    ? 'border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning'
    : on
      ? 'border-success/40 bg-success text-success-foreground shadow-[0_2px_10px_-2px_hsl(var(--success)/0.5)]'
      : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 opacity-80 hover:opacity-100';

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-bold transition-all duration-200',
        cls
      )}
      title={
        offline
          ? `${name} — device ${control.deviceCode ?? ''} offline`
          : `${name} — ${on ? 'ON' : 'OFF'}`
      }
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", on && !offline && "animate-pulse")} />
      <span className="truncate max-w-[90px]">{name}</span>
      {offline ? (
        <WifiOff className="h-3 w-3 shrink-0 ml-1 opacity-70" />
      ) : on ? (
        <Zap className="h-3 w-3 shrink-0 ml-1 fill-current opacity-90" />
      ) : null}
    </div>
  );
}

function RoomCard({ room }: { room: RoomChartRoom }) {
  const anyOn = room.controls.some((c) => c.on && c.deviceOnline);
  const allOffline = room.controls.length > 0 && room.controls.every((c) => !c.deviceOnline);
  const anyOffline = room.controls.some((c) => !c.deviceOnline);

  // Determine card colour state
  const state: 'on' | 'offline' | 'off' = anyOn ? 'on' : allOffline ? 'offline' : 'off';

  return (
    <div
      className={cn(
        'group flex flex-col rounded-xl border p-4 shadow-sm transition-all duration-300 hover-elevate relative overflow-hidden',
        state === 'on'
          ? 'border-green-400 bg-green-50 dark:bg-green-950 shadow-[0_4px_20px_-4px_rgba(34,197,94,0.3)]'
          : state === 'offline'
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-950'
          : 'border-red-300 bg-red-50 dark:bg-red-950',
      )}
    >
      {/* Subtle top stripe as status band */}
      <div className={cn(
        'absolute top-0 left-0 right-0 h-1 rounded-t-xl',
        state === 'on' ? 'bg-green-500' : state === 'offline' ? 'bg-amber-500' : 'bg-red-500',
      )} />

      <div className="mb-3 flex items-start justify-between gap-2 relative z-10 pt-1">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm transition-colors',
              state === 'on'
                ? 'bg-green-500 text-white'
                : state === 'offline'
                ? 'bg-amber-400/30 text-amber-600 dark:text-amber-400'
                : 'bg-red-400/30 text-red-600 dark:text-red-400',
            )}
          >
            <DoorClosed className={cn("h-5 w-5", state === 'on' && "animate-pulse")} />
          </div>
          <div className="leading-tight">
            {/* Room number — large, bold, high contrast */}
            <div className={cn(
              "text-2xl font-black tracking-tight leading-none",
              state === 'on'
                ? 'text-green-700 dark:text-green-300'
                : state === 'offline'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-red-700 dark:text-red-300',
            )}>
              {room.roomNo}
            </div>
            {room.roomTypeName && (
              <div className={cn(
                "text-[11px] font-semibold mt-0.5 uppercase tracking-wide",
                state === 'on' ? 'text-green-600/80 dark:text-green-400/80'
                : state === 'offline' ? 'text-amber-600/80 dark:text-amber-400/80'
                : 'text-red-500/80 dark:text-red-400/80',
              )}>{room.roomTypeName}</div>
            )}
          </div>
        </div>
        
        <span className={cn(
          'rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest border mt-1',
          state === 'on'
            ? 'bg-green-500 text-white border-green-600'
            : state === 'offline'
            ? 'bg-amber-100 text-amber-700 border-amber-400 dark:bg-amber-900 dark:text-amber-300'
            : 'bg-red-100 text-red-700 border-red-400 dark:bg-red-900 dark:text-red-300',
        )}>
          {state === 'on' ? 'Live' : state === 'offline' ? 'Offline' : 'Off'}
        </span>
      </div>

      {/* Last process badge */}
      {room.lastProcessName && (
        <div className="relative z-10 mb-2">
          {(() => {
            const { Icon, label, color } = processConfig(room.lastProcessName);
            return (
              <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', color)}
                title={[label, room.lastGuestName, room.lastGrcNo].filter(Boolean).join(' · ')}>
                <Icon className="h-3 w-3 shrink-0" />
                <span>{label}</span>
                {room.lastGuestName && (
                  <span className="opacity-70 truncate max-w-[90px]">· {room.lastGuestName}</span>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <div className={cn(
        "mt-auto relative z-10 pt-2 border-t",
        state === 'on' ? 'border-green-200 dark:border-green-800'
        : state === 'offline' ? 'border-amber-200 dark:border-amber-800'
        : 'border-red-200 dark:border-red-800',
      )}>
        {room.controls.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 dark:border-gray-800 px-2 py-2 text-center text-[11px] font-medium text-gray-400">
            No controls mapped
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {anyOffline && !allOffline && (
              <div className="flex w-full items-center gap-1.5 text-[11px] font-bold text-warning mb-1 bg-warning/10 p-1.5 rounded-md">
                <AlertTriangle className="h-3.5 w-3.5" /> Some devices offline
              </div>
            )}
            {allOffline && (
              <div className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-amber-600 mb-1 bg-amber-50 dark:bg-amber-900/30 p-2 rounded-md border border-amber-200 dark:border-amber-700">
                <WifiOff className="h-4 w-4" /> All devices offline
              </div>
            )}
            {room.controls.map((c) => (
              <ControlChip key={c.id} control={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RoomChart() {
  const { selectedPropertyId } = useProperty();
  const { toast } = useToast();
  const [blockFilter, setBlockFilter] = useState('all');
  const [floorFilter, setFloorFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [hmsSyncing, setHmsSyncing] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  // collapsible: sets of "blockName" or "blockName::floorName" keys
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [collapsedFloors, setCollapsedFloors] = useState<Set<string>>(new Set());

  const toggleBlock = (key: string) =>
    setCollapsedBlocks((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  const toggleFloor = (key: string) =>
    setCollapsedFloors((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const syncHms = useSyncHmsStatus();

  const handleHmsSync = async () => {
    if (!selectedPropertyId) return;
    setHmsSyncing(true);
    try {
      const result = await syncHms.mutateAsync({ data: { propertyId: selectedPropertyId } });
      refetch();
      const { synced, turnsOn, turnsOff, skipped, errors } = result;
      toast({
        title: `HMS Sync complete — ${synced} room${synced !== 1 ? 's' : ''} processed`,
        description: [
          turnsOn > 0 && `${turnsOn} turned ON`,
          turnsOff > 0 && `${turnsOff} turned OFF`,
          skipped > 0 && `${skipped} skipped`,
          errors.length > 0 && `${errors.length} error(s): ${errors[0]}`,
        ].filter(Boolean).join(' · ') || 'No changes queued.',
      });
    } catch (err: any) {
      toast({ title: 'HMS Sync failed', description: err.message, variant: 'destructive' });
    } finally {
      setHmsSyncing(false);
    }
  };

  const { data: rooms, isLoading, isFetching, refetch } = useGetRoomChart(
    { propertyId: selectedPropertyId! },
    {
      query: {
        enabled: !!selectedPropertyId,
        queryKey: getGetRoomChartQueryKey({ propertyId: selectedPropertyId! }),
        refetchInterval: 15000,
      },
    },
  );

  const blockOptions = useMemo(() => {
    const set = new Map<string, string>();
    (rooms ?? []).forEach((r) => {
      if (r.blockName) set.set(r.blockName, r.blockName);
    });
    return Array.from(set.keys()).sort(naturalCompare);
  }, [rooms]);

  const floorOptions = useMemo(() => {
    const set = new Map<string, string>();
    (rooms ?? []).forEach((r) => {
      if (r.floorName) set.set(r.floorName, r.floorName);
    });
    return Array.from(set.keys()).sort(naturalCompare);
  }, [rooms]);

  // Group rooms by Block -> Floor, honoring filters + search, sorted naturally.
  const groups = useMemo(() => {
    const filtered = (rooms ?? []).filter((r) => {
      if (blockFilter !== 'all' && (r.blockName ?? NO_BLOCK) !== blockFilter) return false;
      if (floorFilter !== 'all' && (r.floorName ?? NO_FLOOR) !== floorFilter) return false;
      if (search.trim() && !r.roomNo.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });

    const byBlock = new Map<string, Map<string, RoomChartRoom[]>>();
    for (const r of filtered) {
      const bKey = r.blockName ?? NO_BLOCK;
      const fKey = r.floorName ?? NO_FLOOR;
      if (!byBlock.has(bKey)) byBlock.set(bKey, new Map());
      const floors = byBlock.get(bKey)!;
      if (!floors.has(fKey)) floors.set(fKey, []);
      floors.get(fKey)!.push(r);
    }

    return Array.from(byBlock.entries())
      .sort(([a], [b]) => naturalCompare(a === NO_BLOCK ? 'zzz' : a, b === NO_BLOCK ? 'zzz' : b))
      .map(([blockName, floors]) => ({
        blockName: blockName === NO_BLOCK ? 'Unassigned Block' : blockName,
        floors: Array.from(floors.entries())
          .sort(([a], [b]) => naturalCompare(a === NO_FLOOR ? 'zzz' : a, b === NO_FLOOR ? 'zzz' : b))
          .map(([floorName, list]) => ({
            floorName: floorName === NO_FLOOR ? 'Unassigned Floor' : floorName,
            rooms: [...list].sort((x, y) => naturalCompare(x.roomNo, y.roomNo)),
          })),
      }));
  }, [rooms, blockFilter, floorFilter, search]);

  const hasBlocks = blockOptions.length > 0;
  const totalRooms = rooms?.length ?? 0;
  const activeRooms = (rooms ?? []).filter((r) => r.controls.some((c) => c.on && c.deviceOnline)).length;

  if (!selectedPropertyId) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6">
            <Activity className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Select Property</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Select a property to view the live power matrix and control rooms.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 -mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 flex flex-col">
      {/* Sticky header — breaks out of AppShell padding so it pins edge-to-edge */}
      <div className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        {/* Collapsed mini-bar: always visible */}
        <div className="flex items-center gap-3 px-4 md:px-6 lg:px-8 py-2">
          <button
            onClick={() => setHeaderCollapsed(c => !c)}
            className="flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:text-primary transition-colors"
            title={headerCollapsed ? 'Expand header' : 'Collapse header'}
          >
            {headerCollapsed
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronUp className="h-4 w-4" />}
            <span className="text-sm font-bold tracking-tight">Power Matrix</span>
          </button>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 text-xs font-bold tracking-wide">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
            </span>
            {activeRooms} / {totalRooms} ACTIVE
          </div>

          {/* Search + filters always visible in mini-bar */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search room..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-36 sm:w-44 pl-8 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 font-medium text-xs focus-visible:ring-primary/50"
              />
            </div>
            {hasBlocks && (
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="h-8 w-32 bg-gray-50 dark:bg-gray-800 font-medium border-gray-200 dark:border-gray-700 text-xs">
                  <SelectValue placeholder="All blocks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-medium text-xs">All blocks</SelectItem>
                  {blockOptions.map((b) => (
                    <SelectItem key={b} value={b} className="font-medium text-xs">{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={floorFilter} onValueChange={setFloorFilter}>
              <SelectTrigger className="h-8 w-32 bg-gray-50 dark:bg-gray-800 font-medium border-gray-200 dark:border-gray-700 text-xs">
                <SelectValue placeholder="All floors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-medium text-xs">All floors</SelectItem>
                {floorOptions.map((f) => (
                  <SelectItem key={f} value={f} className="font-medium text-xs">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Expandable detail panel — hidden when collapsed */}
        {!headerCollapsed && (
          <div className="px-4 md:px-6 lg:px-8 pb-3 border-t border-gray-100 dark:border-gray-800 pt-2">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Live room &amp; device status monitor
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Legend />
                <Button
                  variant="outline" size="sm"
                  onClick={handleHmsSync}
                  disabled={hmsSyncing || isFetching}
                  className="font-semibold shadow-sm hover-elevate border-blue-200 text-blue-700 hover:bg-blue-50 h-8 text-xs"
                >
                  {hmsSyncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />}
                  Sync HMS
                </Button>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}
                  className="font-semibold shadow-sm hover-elevate h-8 text-xs">
                  <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isFetching && 'animate-spin')} />
                  Sync Grid
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DeviceStatusStrip propertyId={selectedPropertyId} />
            </div>
          </div>
        )}
      </div>

      {/* Scrollable room grid — just natural page scroll, no inner ScrollArea */}
      <div className="px-4 md:px-6 lg:px-8 py-6 bg-gray-50/50 dark:bg-gray-950">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
            <p className="font-medium tracking-wide">INITIALIZING POWER MATRIX...</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-6 mb-4">
              <Search className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-lg font-bold text-gray-700 dark:text-gray-300">No rooms found</p>
            <p className="text-sm mt-1">Adjust your filters to see more rooms.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((block) => {
              const blockCollapsed = collapsedBlocks.has(block.blockName);
              const blockRoomCount = block.floors.reduce((n, f) => n + f.rooms.length, 0);
              const blockOnCount = block.floors.reduce((n, f) =>
                n + f.rooms.filter((r) => r.controls.some((c) => c.on && c.deviceOnline)).length, 0);

              return (
                <div key={block.blockName} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                  {/* Block header — always visible, click to collapse */}
                  <button
                    type="button"
                    onClick={() => hasBlocks && toggleBlock(block.blockName)}
                    className={cn(
                      "w-full flex items-center gap-3 px-5 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 text-left transition-colors",
                      hasBlocks && "hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer",
                    )}
                  >
                    {hasBlocks && (
                      blockCollapsed
                        ? <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                        : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                    )}
                    <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-800 dark:text-gray-200 flex-1">
                      {block.blockName}
                    </h2>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-success" />
                        {blockOnCount} ON
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>{blockRoomCount} rooms</span>
                    </div>
                  </button>

                  {!blockCollapsed && (
                    <div className="p-4 flex flex-col gap-5">
                      {block.floors.map((floor) => {
                        const floorKey = `${block.blockName}::${floor.floorName}`;
                        const floorCollapsed = collapsedFloors.has(floorKey);
                        const floorOnCount = floor.rooms.filter((r) =>
                          r.controls.some((c) => c.on && c.deviceOnline)).length;

                        return (
                          <div key={floor.floorName}>
                            {/* Floor header */}
                            <button
                              type="button"
                              onClick={() => toggleFloor(floorKey)}
                              className="w-full flex items-center gap-2 mb-3 group text-left"
                            >
                              {floorCollapsed
                                ? <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
                                : <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0" />}
                              <span className="h-5 w-1 rounded-full bg-primary shrink-0" />
                              <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-primary transition-colors">
                                {floor.floorName}
                              </span>
                              <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-[10px]">
                                {floor.rooms.length} {floor.rooms.length === 1 ? 'room' : 'rooms'}
                              </Badge>
                              {floorOnCount > 0 && (
                                <Badge className="bg-success/10 text-success border border-success/30 font-bold text-[10px]">
                                  {floorOnCount} live
                                </Badge>
                              )}
                            </button>

                            {!floorCollapsed && (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                {floor.rooms.map((room) => (
                                  <RoomCard key={room.id} room={room} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs font-bold text-gray-500 bg-gray-100/80 dark:bg-gray-800/80 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-success shadow-[0_0_8px_hsl(var(--success)/0.6)]" /> Live Load
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" /> Standby
      </span>
      <span className="flex items-center gap-1.5 text-warning">
        <AlertTriangle className="h-3.5 w-3.5" /> Offline
      </span>
    </div>
  );
}
