import { useMemo, useState } from 'react';
import {
  useGetRoomChart,
  getGetRoomChartQueryKey,
  useListDevices,
  getListDevicesQueryKey,
  RoomChartRoom,
  RoomChartControl,
} from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
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
} from 'lucide-react';

// Compact "how long ago" for device last-seen times.
function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never seen';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
  if (!devices || devices.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Boxes:</span>
      {devices.map((d) => (
        <div
          key={d.id}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
            d.online
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-600',
          )}
          title={
            d.online
              ? `Box ${d.code} online — last poll ${timeAgo(d.lastSeenAt)}`
              : `Box ${d.code} OFFLINE — last poll ${timeAgo(d.lastSeenAt)}`
          }
        >
          {d.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          <span>Box {d.code}</span>
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              d.online ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]' : 'bg-red-500',
            )}
          />
          <span className={cn('text-[10px]', d.online ? 'text-green-500' : 'text-red-400')}>
            {timeAgo(d.lastSeenAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

const NO_BLOCK = '__no_block__';
const NO_FLOOR = '__no_floor__';

// Natural sort so "10" sorts after "9" instead of after "1".
function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
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
    ? 'border-gray-200 bg-gray-50 text-gray-400'
    : on
      ? 'border-green-200 bg-green-50 text-green-700'
      : 'border-red-200 bg-red-50 text-red-700';

  const dot = offline ? 'bg-gray-300' : on ? 'bg-green-500' : 'bg-red-500';

  return (
    <div
      className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium', cls)}
      title={
        offline
          ? `${name} — device ${control.deviceCode ?? ''} offline`
          : `${name} — ${on ? 'ON' : 'OFF'}`
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate max-w-[90px]">{name}</span>
      {offline ? (
        <WifiOff className="h-3 w-3 shrink-0" />
      ) : (
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
      )}
    </div>
  );
}

function RoomCard({ room }: { room: RoomChartRoom }) {
  const anyOn = room.controls.some((c) => c.on && c.deviceOnline);
  const allOffline = room.controls.length > 0 && room.controls.every((c) => !c.deviceOnline);

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border bg-white p-3 shadow-sm transition-colors',
        anyOn ? 'border-green-300 ring-1 ring-green-100' : 'border-gray-200',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md',
              anyOn ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500',
            )}
          >
            <DoorClosed className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold text-gray-900">{room.roomNo}</div>
            {room.roomTypeName && (
              <div className="text-[11px] text-gray-400">{room.roomTypeName}</div>
            )}
          </div>
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            anyOn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
          )}
        >
          {anyOn ? 'Power On' : 'Off'}
        </span>
      </div>

      {room.controls.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 px-2 py-1.5 text-center text-[11px] text-gray-400">
          No controls mapped
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allOffline && (
            <div className="flex w-full items-center gap-1 text-[11px] text-amber-600">
              <WifiOff className="h-3 w-3" /> device offline
            </div>
          )}
          {room.controls.map((c) => (
            <ControlChip key={c.id} control={c} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RoomChart() {
  const { selectedPropertyId } = useProperty();
  const [blockFilter, setBlockFilter] = useState('all');
  const [floorFilter, setFloorFilter] = useState('all');
  const [search, setSearch] = useState('');

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
      <div className="p-6 text-sm text-gray-500">Select a property to view the room chart.</div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Room Chart</h1>
            <p className="text-sm text-gray-500">
              Live room &amp; device status — {activeRooms} of {totalRooms} rooms powered on
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Legend />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        <DeviceStatusStrip propertyId={selectedPropertyId} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search room no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 pl-8"
            />
          </div>
          {hasBlocks && (
            <Select value={blockFilter} onValueChange={setBlockFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="All blocks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All blocks</SelectItem>
                {blockOptions.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={floorFilter} onValueChange={setFloorFilter}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="All floors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All floors</SelectItem>
              {floorOptions.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="flex-1 bg-gray-50">
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading room chart…
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <DoorClosed className="mb-2 h-8 w-8" />
              <p className="text-sm">No rooms match the current filters.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {groups.map((block) => (
                <div key={block.blockName}>
                  {hasBlocks && (
                    <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-700">
                      {block.blockName}
                    </h2>
                  )}
                  <div className="flex flex-col gap-5">
                    {block.floors.map((floor) => (
                      <div key={floor.floorName}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="h-4 w-1 rounded-full bg-primary" />
                          <h3 className="text-sm font-semibold text-gray-600">{floor.floorName}</h3>
                          <span className="text-xs text-gray-400">({floor.rooms.length})</span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                          {floor.rooms.map((room) => (
                            <RoomCard key={room.id} room={room} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> On
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Off
      </span>
      <span className="flex items-center gap-1">
        <WifiOff className="h-3 w-3 text-gray-400" /> Offline
      </span>
    </div>
  );
}
