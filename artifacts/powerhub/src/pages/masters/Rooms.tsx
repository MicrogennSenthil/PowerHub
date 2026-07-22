import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListRooms, 
  useCreateRoom, 
  useUpdateRoom, 
  useDeleteRoom,
  useBulkCreateRooms,
  useGetMhmsRoomPreview,
  getGetMhmsRoomPreviewQueryKey,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Edit2, Trash2, Upload, CheckCircle2, SkipForward, AlertCircle, FileText, HelpCircle, Wifi, RefreshCw } from 'lucide-react';
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
  const [importTab, setImportTab] = useState<'api' | 'csv'>('api');
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [fetchEnabled, setFetchEnabled] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // MHMS API live fetch (only fires when fetchEnabled = true and dialog is open)
  const {
    data: mhmsRooms,
    isFetching: mhmsFetching,
    error: mhmsError,
    refetch: refetchMhms,
  } = useGetMhmsRoomPreview(
    { propertyId: selectedPropertyId! },
    {
      query: {
        enabled: !!selectedPropertyId && fetchEnabled && isImportOpen,
        retry: false,
        queryKey: getGetMhmsRoomPreviewQueryKey({ propertyId: selectedPropertyId! }),
      },
    },
  );

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
    setFetchEnabled(false);
    setImportTab('api');
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

  // Resolve MHMS API rows into the same ParsedRow shape as CSV
  const resolvedMhmsRows: ParsedRow[] | null = mhmsRooms
    ? (() => {
        const existingNos = new Set((rooms ?? []).map((r) => r.roomNo));
        const matchBlock = (name: string) =>
          name ? (blocks ?? []).find((b) => b.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;
        const matchFloor = (name: string) =>
          name ? (floors ?? []).find((f) => f.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;
        const matchType = (name: string) =>
          name ? (roomTypes ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;
        return mhmsRooms.map((r) => ({
          roomNo: r.roomNo,
          blockName: r.blockName,
          floorName: r.floorName,
          roomTypeName: r.roomTypeName,
          blockId: matchBlock(r.blockName),
          floorId: matchFloor(r.floorName),
          roomTypeId: matchType(r.roomTypeName),
          exists: existingNos.has(r.roomNo),
        }));
      })()
    : null;

  const activeRows = importTab === 'api' ? resolvedMhmsRows : parsedRows;
  const newRows = (activeRows ?? []).filter((r) => !r.exists);

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
              Fetch rooms directly from MHMS via API, or paste a CSV export. Block, Floor, and Room Type names are matched automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <Tabs value={importTab} onValueChange={(v) => { setImportTab(v as 'api' | 'csv'); setParsedRows(null); }}>
              <TabsList className="w-full">
                <TabsTrigger value="api" className="flex-1">
                  <Wifi className="mr-1.5 h-4 w-4" /> Fetch from MHMS API
                </TabsTrigger>
                <TabsTrigger value="csv" className="flex-1">
                  <FileText className="mr-1.5 h-4 w-4" /> Paste / Upload CSV
                </TabsTrigger>
              </TabsList>

              {/* ── API TAB ── */}
              <TabsContent value="api" className="space-y-4 mt-4">
                {!fetchEnabled ? (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-5 text-center space-y-3">
                    <Wifi className="mx-auto h-8 w-8 text-blue-400" />
                    <p className="text-sm font-medium text-blue-800">Direct MHMS Connection</p>
                    <p className="text-xs text-blue-600">
                      PowerHub will call your MHMS server's room list API and pull all rooms automatically.<br />
                      Make sure the <strong>MHMS API URL and key</strong> are configured in{' '}
                      <strong>Facility → Properties → Edit</strong> for this property first.
                    </p>
                    <Button onClick={() => setFetchEnabled(true)} className="mt-2">
                      <Wifi className="mr-2 h-4 w-4" /> Connect & Fetch Rooms
                    </Button>
                  </div>
                ) : mhmsFetching ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-3 text-gray-500">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="text-sm">Connecting to MHMS…</p>
                  </div>
                ) : mhmsError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
                    <p className="text-sm font-medium text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" /> Connection failed
                    </p>
                    <p className="text-xs text-red-600">{(mhmsError as any)?.message ?? 'Unknown error'}</p>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => refetchMhms()}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setFetchEnabled(false)}>
                        Change settings
                      </Button>
                    </div>
                  </div>
                ) : resolvedMhmsRows !== null ? (
                  <PreviewTable
                    rows={resolvedMhmsRows}
                    onRefresh={() => refetchMhms()}
                    showRefresh
                  />
                ) : null}
              </TabsContent>

              {/* ── CSV TAB ── */}
              <TabsContent value="csv" className="space-y-4 mt-4">
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
                      <p>Accepted column order (header row optional):</p>
                      <pre className="mt-1 rounded bg-blue-100 p-2 font-mono text-[11px]">{`RoomNo, Block, Floor, RoomType\n101, Block A, I - Floor, Double AC\n102, Block A, I - Floor, Non AC`}</pre>
                      <p>Only <strong>RoomNo</strong> is required. Names must match your PowerHub Blocks / Floors / Room Types masters.</p>
                    </div>
                  )}
                </div>

                {parsedRows === null ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="csvArea">Paste CSV data</Label>
                      <div className="flex items-center gap-2">
                        <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileUpload} />
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
                ) : (
                  <div className="space-y-3">
                    <PreviewTable rows={parsedRows} />
                    <Button variant="outline" size="sm" onClick={() => setParsedRows(null)}>← Back to paste</Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
            {activeRows !== null && newRows.length > 0 && (
              <Button onClick={handleImport} disabled={bulkMutation.isPending}>
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

// Reusable preview table shown for both API and CSV import paths
function PreviewTable({ rows, onRefresh, showRefresh }: { rows: ParsedRow[]; onRefresh?: () => void; showRefresh?: boolean }) {
  const newCount = rows.filter((r) => !r.exists).length;
  const skipCount = rows.filter((r) => r.exists).length;
  const hasUnmatched = rows.some((r) => !r.exists && (
    (r.blockName && !r.blockId) || (r.floorName && !r.floorId) || (r.roomTypeName && !r.roomTypeId)
  ));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-green-700 font-medium border border-green-200">
          <CheckCircle2 className="h-3.5 w-3.5" /> {newCount} to import
        </span>
        {skipCount > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-gray-600 font-medium border border-gray-200">
            <SkipForward className="h-3.5 w-3.5" /> {skipCount} already exist (will skip)
          </span>
        )}
        {hasUnmatched && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-700 font-medium border border-amber-200">
            <AlertCircle className="h-3.5 w-3.5" /> Some names unmatched
          </span>
        )}
        {showRefresh && onRefresh && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onRefresh}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
        )}
      </div>
      <div className="rounded-md border overflow-hidden max-h-64 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Room No</TableHead>
              <TableHead className="text-xs">Block</TableHead>
              <TableHead className="text-xs">Floor</TableHead>
              <TableHead className="text-xs">Room Type</TableHead>
              <TableHead className="text-xs w-[80px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i} className={row.exists ? 'opacity-40' : ''}>
                <TableCell className="font-mono text-xs font-semibold">{row.roomNo}</TableCell>
                <TableCell className="text-xs"><NameCell raw={row.blockName} matched={row.blockId !== null} /></TableCell>
                <TableCell className="text-xs"><NameCell raw={row.floorName} matched={row.floorId !== null} /></TableCell>
                <TableCell className="text-xs"><NameCell raw={row.roomTypeName} matched={row.roomTypeId !== null} /></TableCell>
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
      {hasUnmatched && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
          Rooms with amber names will still be imported — just without that assignment. Add the matching names in Blocks, Floors, or Room Types masters first if you want them linked.
        </p>
      )}
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
