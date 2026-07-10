import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListRooms, 
  useCreateRoom, 
  useUpdateRoom, 
  useDeleteRoom,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function Rooms() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = useProperty();
  
  const { data: rooms, isLoading } = useListRooms(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListRoomsQueryKey({ propertyId: selectedPropertyId! }) } }
  );

  const { data: blocks } = useListBlocks({ propertyId: selectedPropertyId! }, { query: { enabled: !!selectedPropertyId, queryKey: getListBlocksQueryKey({ propertyId: selectedPropertyId! }) } });
  const { data: floors } = useListFloors({ propertyId: selectedPropertyId! }, { query: { enabled: !!selectedPropertyId, queryKey: getListFloorsQueryKey({ propertyId: selectedPropertyId! }) } });
  const { data: roomTypes } = useListRoomTypes({ propertyId: selectedPropertyId! }, { query: { enabled: !!selectedPropertyId, queryKey: getListRoomTypesQueryKey({ propertyId: selectedPropertyId! }) } });
  
  const createMutation = useCreateRoom();
  const updateMutation = useUpdateRoom();
  const deleteMutation = useDeleteRoom();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Room | null>(null);
  const [deletingRecord, setDeleteRecord] = useState<Room | null>(null);

  const [formData, setFormData] = useState({ 
    roomNo: '', 
    blockId: '0', 
    floorId: '0', 
    roomTypeId: '0', 
    active: true 
  });

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
      active: room.active 
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
        propertyId: selectedPropertyId
      };

      if (editingRecord) {
        await updateMutation.mutateAsync({ id: editingRecord.id, data: payload });
        toast({ title: 'Room updated successfully' });
      } else {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: 'Room created successfully' });
      }
      queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey({ propertyId: selectedPropertyId }) });
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
      queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey({ propertyId: selectedPropertyId }) });
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Error deleting room', description: err.message, variant: 'destructive' });
    }
  };

  if (!selectedPropertyId) return <div className="p-8 text-center text-gray-500">Please select a property first.</div>;
  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Rooms</h1>
          <p className="text-sm text-gray-500">Manage all rooms and their allocations.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Add Room
        </Button>
      </div>

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
                    {room.active ? <Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge> : <Badge variant="outline" className="bg-gray-100 text-gray-600">Inactive</Badge>}
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
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>{createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete Room "{deletingRecord?.roomNo}".</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting...' : 'Delete'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
