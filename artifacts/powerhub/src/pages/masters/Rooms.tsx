import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListRooms, 
  useCreateRoom, 
  useUpdateRoom, 
  useDeleteRoom,
  useBulkCreateRooms,
  getListRoomsQueryKey,
  getListBlocksQueryKey,
  getListFloorsQueryKey,
  getListRoomTypesQueryKey,
  useListBlocks,
  useListFloors,
  useListRoomTypes,
  Room
} from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Edit2, Trash2, Upload, CheckCircle2, SkipForward, AlertCircle, FileText, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ── CSV parsing ──────────────────────────────────────────────────────────────

interface ParsedRow {
  roomNo: string;
  blockName: string;
  floorName: string;
  roomTypeName: string;
  // resolved IDs after matching against existing masters
  blockId: number | null;
  floorId: number | null;
  roomTypeId: number | null;
  // whether the room already exists in PowerHub
  exists: boolean;
}

function parseCsv(raw: string): Array<{ roomNo: string; blockName: string; floorName: string; roomTypeName: string }> {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // detect whether first line is a header (contains letters only, no numbers typical of room numbers)
  const firstLower = lines[0].toLowerCase();
  const isHeader =
    firstLower.includes('room') ||
    firstLower.includes('block') ||
    firstLower.includes('floor') ||
    firstLower.includes('type');

  const dataLines = isHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      // Support comma and tab delimiters; trim quotes
      const cols = line.split(/,|\t/).map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const [roomNo = '', blockName = '', floorName = '', roomTypeName = ''] = cols;
      return { roomNo: roomNo.trim(), blockName: blockName.trim(), floorName: floorName.trim(), roomTypeName: roomTypeName.trim() };
    })
    .filter((r) => r.roomNo.length > 0);
}

// ── Component ────────────────────────────────────────────────────────────────

export function Rooms() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = useProperty();
  
  const { data: rooms, isLoading } = useListRooms(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListRoomsQueryKey({ propertyId: selectedPropertyId! }) } }
  );

  const { data: blocks } = useListBlocks(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListBlocksQueryKey({ propertyId: selectedPropertyId! }) } }
  );
  const { data: floors } = useListFloors(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListFloorsQueryKey({ propertyId: selectedPropertyId! }) } }
  );
  const { data: roomTypes } = useListRoomTypes(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListRoomTypesQueryKey({ propertyId: selectedPropertyId! }) } }
  );
  
  const createMutation = useCreateRoom();
  const updateMutation = useUpdateRoom();
  const deleteMutation = useDeleteRoom();
  const bulkMutation = useBulkCreateRooms();

  // ── single-room editor state ─────────────────────────────────────────────
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Room | null>(null);
  const [deletingRecord, setDeleteRecord] = useState<Room | null>(null);
  const [formData, setFormData] = useState({ roomNo: '', blockId: '0', floorId: '0', roomTypeId: '0', active: true });

  // ── import state ─────────────────────────────────────────────────────────
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [showHint, setShowHint] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidateRooms = () =>
    queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey({ propertyId: selectedPropertyId! }) });

  // ── single-room handlers ─────────────────────────────────────────────────
  const openNew = () => {
    setEditingRecord(null);
    setFormData({ roomNo: '', blockId: '0', floorId: '0', roomTypeId: '0', active: true });
    setIsEditorOpen(true);
  };

  const openEdit = (room: Room) => {
    setEditingRecord(room);
    setFormData({
      roomNo: room.roomNo,
      blockId: room.blockId?.toString() || '0',
      floorId: room.floorId?.toString() || '0',
      roomTypeId: room.roomTypeId?.toString() || '0',
      active: room.active,
    });
    setIsEditorOpen(true);
  };

  const confirmDelete = (room: Room) => {
    setDeleteRecord(room);
    setIsDeleteOpen(true);
  };

  const handleSave = async () => {
    if (!formData.roomNo) {
      toast({ title: 'Validation Error', description: 'Room No is required', variant: 'destructive' });
      return;
    }
    if (!selectedPropertyId) return;
    try {
      const payload = {
        roomNo: formData.roomNo,
        blockId: formData.blockId !== '0' ? parseInt(formData.blockId, 10) : undefined,
        floorId: formData.floorId !== '0' ? parseInt(formData.floorId, 10) : undefined,
        roomTypeId: formData.roomTypeId !== '0' ? parseInt(formData.roomTypeId, 10) : undefined,
        active: formData.active,
        propertyId: selectedPropertyId,
      };
      if (editingRecord) {
        await updateMutation.mutateAsync({ id: editingRecord.id, data: payload });
        toast({ title: 'Room updated successfully' });
      } else {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: 'Room created successfully' });
      }
      invalidateRooms();
      setIsEditorOpen(false);
    } catch (err: any) {
      toast({ title: 'Error saving room', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingRecord || !selectedPropertyId) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingRecord.id });
      toast({ title: 'Room deleted successfully' });
      invalidateRooms();
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Error deleting room', description: err.message, variant: 'destructive' });
    }
  };

  // ── import handlers ──────────────────────────────────────────────────────
  const openImport = () => {
    setCsvText('');
    setParsedRows(null);
    setShowHint(false);
    setIsImportOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string ?? '');
      setParsedRows(null);
    };
    reader.readAsText(file);
    // reset input so same file can be reloaded
    e.target.value = '';
  };

  const handleParsePreview = () => {
    const raw = parseCsv(csvText);
    if (raw.length === 0) {
      toast({ title: 'No rooms found', description: 'Check your CSV format and try again.', variant: 'destructive' });
      return;
    }

    const existingNos = new Set((rooms ?? []).map((r) => r.roomNo));

    // case-insensitive name lookup helpers
    const matchBlock = (name: string) =>
      name ? (blocks ?? []).find((b) => b.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;
    const matchFloor = (name: string) =>
      name ? (floors ?? []).find((f) => f.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;
    const matchType = (name: string) =>
      name ? (roomTypes ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;

    const resolved: ParsedRow[] = raw.map((r) => ({
      ...r,
      blockId: matchBlock(r.blockName),
      floorId: matchFloor(r.floorName),
      roomTypeId: matchType(r.roomTypeName),
      exists: existingNos.has(r.roomNo),
    }));

    setParsedRows(resolved);
  };

  const newRows = (parsedRows ?? []).filter((r) => !r.exists);

  const handleImport = async () => {
    if (!selectedPropertyId || newRows.length === 0) return;
    try {
      const result = await bulkMutation.mutateAsync({
        data: {
          propertyId: selectedPropertyId,
          rooms: newRows.map((r) => ({
            roomNo: r.roomNo,
            blockId: r.blockId ?? undefined,
            floorId: r.floorId ?? undefined,
            roomTypeId: r.roomTypeId ?? undefined,
          })),
        },
      });
      toast({
        title: `Import complete`,
        description: `${result.created} room${result.created !== 1 ? 's' : ''} created, ${result.skipped} skipped (already exist).`,
      });
      invalidateRooms();
      setIsImportOpen(false);
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    }
  };

  // ── render ───────────────────────────────────────────────────────────────
  if (!selectedPropertyId) return <div className="p-8 text-center text-gray-500">Please select a property first.</div>;
  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Rooms</h1>
          <p className="text-sm text-gray-500">Manage all rooms and their allocations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openImport}>
            <Upload className="mr-2 h-4 w-4" /> Import from MHMS
          </Button>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Add Room
          </Button>
        </div>
      </div>

      {/* ── Rooms table ── */}
      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room No</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Block</TableHead>
              <TableHead>Floor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms?.length ? (
              rooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">{room.roomNo}</TableCell>
                  <TableCell>{room.roomTypeName || '—'}</TableCell>
                  <TableCell>{room.blockName || '—'}</TableCell>
                  <TableCell>{room.floorName || '—'}</TableCell>
                  <TableCell>
                    {room.active
                      ? <Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge>
                      : <Badge variant="outline" className="bg-gray-100 text-gray-600">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(room)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => confirmDelete(room)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-gray-500">No rooms found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Single-room editor dialog ── */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>{editingRecord ? 'Edit Room' : 'New Room'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="roomNo">Room No / Label</Label>
              <Input id="roomNo" value={formData.roomNo} onChange={(e) => setFormData({ ...formData, roomNo: e.target.value })} placeholder="e.g. 101" />
            </div>
            <div className="space-y-2">
              <Label>Room Type</Label>
              <Select value={formData.roomTypeId} onValueChange={(v) => setFormData({ ...formData, roomTypeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">None</SelectItem>
                  {roomTypes?.map(rt => <SelectItem key={rt.id} value={rt.id.toString()}>{rt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Block</Label>
              <Select value={formData.blockId} onValueChange={(v) => setFormData({ ...formData, blockId: v })}>
                <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">None</SelectItem>
                  {blocks?.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Floor</Label>
              <Select value={formData.floorId} onValueChange={(v) => setFormData({ ...formData, floorId: v })}>
                <SelectTrigger><SelectValue placeholder="Select floor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">None</SelectItem>
                  {floors?.map(f => <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Switch id="active" checked={formData.active} onCheckedChange={(c) => setFormData({ ...formData, active: c })} />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete Room "{deletingRecord?.roomNo}".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Import from MHMS dialog ── */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Import Rooms from MHMS
            </DialogTitle>
            <DialogDescription>
              Export your room list from MHMS and paste it here. Block, Floor, and Room Type names are matched automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* Format hint */}
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <button
                className="flex w-full items-center justify-between text-left text-sm font-medium text-blue-700"
                onClick={() => setShowHint((v) => !v)}
              >
                <span className="flex items-center gap-1.5"><HelpCircle className="h-4 w-4" /> How to export from MHMS</span>
                <span className="text-xs text-blue-500">{showHint ? 'Hide' : 'Show'}</span>
              </button>
              {showHint && (
                <div className="mt-2 space-y-1.5 text-xs text-blue-700">
                  <p>In MHMS go to <strong>Masters → Rooms</strong>, then use <strong>Export → CSV/Excel</strong>.</p>
                  <p>The import accepts CSV or tab-separated files with columns in this order:</p>
                  <pre className="mt-1 rounded bg-blue-100 p-2 font-mono text-[11px]">
{`RoomNo, Block, Floor, RoomType
101, Block A, I - Floor, Double AC
102, Block A, I - Floor, Non AC`}
                  </pre>
                  <p>Only <strong>RoomNo</strong> is required. The other columns are optional — names must match what you've set up in PowerHub's Blocks, Floors, and Room Types masters. Rooms that already exist are skipped automatically.</p>
                </div>
              )}
            </div>

            {/* Paste area + file upload */}
            {parsedRows === null && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="csvArea">Paste CSV data</Label>
                  <div className="flex items-center gap-2">
                    <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xls,.xlsx" className="hidden" onChange={handleFileUpload} />
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" /> Upload file
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="csvArea"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={`RoomNo, Block, Floor, RoomType\n101, Block A, I - Floor, Double AC\n102, Block A, I - Floor, Non AC`}
                  className="h-48 font-mono text-xs resize-none"
                />
                <Button className="w-full" onClick={handleParsePreview} disabled={!csvText.trim()}>
                  Preview Rooms
                </Button>
              </div>
            )}

            {/* Preview table */}
            {parsedRows !== null && (
              <div className="space-y-3">
                {/* Summary badges */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-green-700 font-medium border border-green-200">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {newRows.length} to import
                  </span>
                  {parsedRows.filter((r) => r.exists).length > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-gray-600 font-medium border border-gray-200">
                      <SkipForward className="h-3.5 w-3.5" /> {parsedRows.filter((r) => r.exists).length} already exist (will skip)
                    </span>
                  )}
                  {parsedRows.some((r) => !r.exists && (
                    (r.blockName && !r.blockId) || (r.floorName && !r.floorId) || (r.roomTypeName && !r.roomTypeId)
                  )) && (
                    <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-700 font-medium border border-amber-200">
                      <AlertCircle className="h-3.5 w-3.5" /> Some names unmatched
                    </span>
                  )}
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs">Room No</TableHead>
                        <TableHead className="text-xs">Block</TableHead>
                        <TableHead className="text-xs">Floor</TableHead>
                        <TableHead className="text-xs">Room Type</TableHead>
                        <TableHead className="text-xs w-[90px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedRows.map((row, i) => (
                        <TableRow key={i} className={row.exists ? 'opacity-50' : ''}>
                          <TableCell className="font-mono text-xs font-semibold">{row.roomNo}</TableCell>
                          <TableCell className="text-xs">
                            <NameCell raw={row.blockName} matched={row.blockId !== null} />
                          </TableCell>
                          <TableCell className="text-xs">
                            <NameCell raw={row.floorName} matched={row.floorId !== null} />
                          </TableCell>
                          <TableCell className="text-xs">
                            <NameCell raw={row.roomTypeName} matched={row.roomTypeId !== null} />
                          </TableCell>
                          <TableCell>
                            {row.exists
                              ? <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-500">Skip</Badge>
                              : <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">New</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {parsedRows.some((r) => !r.exists && (
                  (r.blockName && !r.blockId) || (r.floorName && !r.floorId) || (r.roomTypeName && !r.roomTypeId)
                )) && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
                    Highlighted names couldn't be matched to a PowerHub master. Those rooms will still be imported — just without that assignment. Add matching names in Blocks, Floors, or Room Types first if you want them linked.
                  </p>
                )}

                <Button variant="outline" size="sm" onClick={() => setParsedRows(null)}>← Back to paste</Button>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
            {parsedRows !== null && (
              <Button
                onClick={handleImport}
                disabled={bulkMutation.isPending || newRows.length === 0}
              >
                {bulkMutation.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…</>
                  : `Import ${newRows.length} Room${newRows.length !== 1 ? 's' : ''}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Small helper: shows name with a green tick if matched, amber dot if not
function NameCell({ raw, matched }: { raw: string; matched: boolean }) {
  if (!raw) return <span className="text-gray-400">—</span>;
  return (
    <span className={cn('flex items-center gap-1', matched ? 'text-gray-800' : 'text-amber-600')}>
      {matched
        ? <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
        : <AlertCircle className="h-3 w-3 shrink-0 text-amber-500" />}
      {raw}
    </span>
  );
}
