import { useEffect, useMemo, useState } from 'react';
import { Control } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Wand2 } from 'lucide-react';

export interface BulkAssignItem {
  id: number;
  label: string | null;
  roomId: number | null;
  controlTypeId: number | null;
}

interface Row {
  id: number;
  slate: number;
  channel: number;
  label: string;
  roomId: string;
  controlTypeId: string;
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function BulkAssignDialog({
  open,
  onOpenChange,
  controls,
  rooms,
  controlTypes,
  deviceCode,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controls: Control[];
  rooms: { id: number; roomNo: string }[];
  controlTypes: { id: number; name: string }[];
  deviceCode: string;
  onSave: (items: BulkAssignItem[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Pattern helper state
  const [channelsPerRoom, setChannelsPerRoom] = useState(3);
  const [slotTypes, setSlotTypes] = useState<string[]>(['0', '0', '0']);
  const [startRoomId, setStartRoomId] = useState('0');

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => naturalCompare(a.roomNo, b.roomNo)),
    [rooms],
  );

  // Reset the working grid whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    const sorted = [...controls].sort(
      (a, b) => a.slate - b.slate || a.channel - b.channel,
    );
    setRows(
      sorted.map((c) => ({
        id: c.id,
        slate: c.slate,
        channel: c.channel,
        label: c.label ?? '',
        roomId: c.roomId?.toString() ?? '0',
        controlTypeId: c.controlTypeId?.toString() ?? '0',
      })),
    );
  }, [open, controls]);

  // Keep the number of per-slot type selectors in sync with channelsPerRoom.
  useEffect(() => {
    setSlotTypes((prev) => {
      const next = [...prev];
      while (next.length < channelsPerRoom) next.push('0');
      next.length = channelsPerRoom;
      return next;
    });
  }, [channelsPerRoom]);

  const updateRow = (id: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const applyPattern = () => {
    // "0" is the "First room" sentinel -> start at index 0. An explicit room maps
    // to its position in the naturally-sorted list.
    const found = sortedRooms.findIndex((r) => r.id.toString() === startRoomId);
    const startIdx = startRoomId === '0' ? 0 : found;
    setRows((prev) =>
      prev.map((r, i) => {
        const slot = i % channelsPerRoom;
        const roomSlot = Math.floor(i / channelsPerRoom);
        const roomIdx = startIdx >= 0 ? startIdx + roomSlot : -1;
        const room = roomIdx >= 0 && roomIdx < sortedRooms.length ? sortedRooms[roomIdx] : null;
        return {
          ...r,
          roomId: room ? room.id.toString() : r.roomId,
          controlTypeId: slotTypes[slot] ?? '0',
        };
      }),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const items: BulkAssignItem[] = rows.map((r) => ({
        id: r.id,
        label: r.label.trim() ? r.label.trim() : null,
        roomId: r.roomId !== '0' ? parseInt(r.roomId, 10) : null,
        controlTypeId: r.controlTypeId !== '0' ? parseInt(r.controlTypeId, 10) : null,
      }));
      await onSave(items);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk assign channels — {deviceCode}</DialogTitle>
          <DialogDescription>
            Map every channel to a room and load type at once. Use the pattern helper to auto-fill,
            then fine-tune any row before saving.
          </DialogDescription>
        </DialogHeader>

        {/* Pattern helper */}
        <div className="rounded-md border bg-gray-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <Wand2 className="h-4 w-4 text-primary" /> Auto-fill pattern
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28">
              <Label className="text-xs text-gray-500">Channels / room</Label>
              <Input
                type="number"
                min={1}
                max={16}
                value={channelsPerRoom}
                onChange={(e) =>
                  setChannelsPerRoom(Math.min(16, Math.max(1, parseInt(e.target.value, 10) || 1)))
                }
                className="h-8"
              />
            </div>
            <div className="w-40">
              <Label className="text-xs text-gray-500">Start at room</Label>
              <Select value={startRoomId} onValueChange={setStartRoomId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Room" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">First room</SelectItem>
                  {sortedRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>{r.roomNo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-gray-500">Type order (repeats per room)</Label>
              <div className="flex flex-wrap gap-2">
                {slotTypes.map((t, idx) => (
                  <Select
                    key={idx}
                    value={t}
                    onValueChange={(v) =>
                      setSlotTypes((prev) => prev.map((p, i) => (i === idx ? v : p)))
                    }
                  >
                    <SelectTrigger className="h-8 w-32"><SelectValue placeholder={`Slot ${idx + 1}`} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">— none —</SelectItem>
                      {controlTypes.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              </div>
            </div>
            <Button type="button" variant="secondary" className="h-8" onClick={applyPattern}>
              Apply
            </Button>
          </div>
        </div>

        {/* Editable grid */}
        <div className="rounded-md border">
          <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <div className="col-span-2">Ch</div>
            <div className="col-span-3">Room</div>
            <div className="col-span-3">Type</div>
            <div className="col-span-4">Label</div>
          </div>
          <ScrollArea className="max-h-[360px]">
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2">
                  <div className="col-span-2 text-sm font-medium text-gray-500">
                    Ch {r.channel}
                    <span className="ml-1 text-[10px] text-gray-400">S{r.slate}</span>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <Select value={r.roomId} onValueChange={(v) => updateRow(r.id, { roomId: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Room" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Unassigned</SelectItem>
                        {sortedRooms.map((room) => (
                          <SelectItem key={room.id} value={room.id.toString()}>{room.roomNo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <Select value={r.controlTypeId} onValueChange={(v) => updateRow(r.id, { controlTypeId: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Unassigned</SelectItem>
                        {controlTypes.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4 min-w-0">
                    <Input
                      value={r.label}
                      onChange={(e) => updateRow(r.id, { label: e.target.value })}
                      placeholder="Label (optional)"
                      className="h-8"
                    />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || rows.length === 0}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save all ({rows.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
