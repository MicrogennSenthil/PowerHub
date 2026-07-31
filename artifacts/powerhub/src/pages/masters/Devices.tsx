import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  useListDevices, 
  useCreateDevice, 
  useUpdateDevice, 
  useDeleteDevice,
  getListDevicesQueryKey,
  getListFloorsQueryKey,
  useListFloors,
  Device
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
import { Loader2, Plus, Edit2, Trash2, Settings, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export function Devices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = useProperty();
  
  const { data: devices, isLoading } = useListDevices(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListDevicesQueryKey({ propertyId: selectedPropertyId! }) } }
  );

  const { data: floors } = useListFloors({ propertyId: selectedPropertyId! }, { query: { enabled: !!selectedPropertyId, queryKey: getListFloorsQueryKey({ propertyId: selectedPropertyId! }) } });
  
  const createMutation = useCreateDevice();
  const updateMutation = useUpdateDevice();
  const deleteMutation = useDeleteDevice();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Device | null>(null);
  const [deletingRecord, setDeleteRecord] = useState<Device | null>(null);

  const [formData, setFormData] = useState({ 
    code: '', 
    ipAddress: '', 
    setupIp: '',
    description: '', 
    floorId: '0', 
    active: true 
  });
  const [codeError, setCodeError] = useState<string | null>(null);

  /** Compute the next available 6-digit code from the loaded device list. */
  const nextCode = () => {
    const existing = (devices ?? [])
      .map(d => d.code)
      .filter(c => /^\d{6}$/.test(c))
      .map(c => parseInt(c, 10));
    const max = existing.length > 0 ? Math.max(...existing) : 0;
    return String(max + 1).padStart(6, '0');
  };

  const openNew = () => {
    setEditingRecord(null);
    setCodeError(null);
    setFormData({ code: nextCode(), ipAddress: '', setupIp: '', description: '', floorId: '0', active: true });
    setIsEditorOpen(true);
  };

  const openEdit = (device: Device) => {
    setEditingRecord(device);
    setCodeError(null);
    setFormData({ 
      code: device.code, 
      ipAddress: device.ipAddress || '', 
      setupIp: device.setupIp || '',
      description: device.description || '', 
      floorId: device.floorId?.toString() || '0', 
      active: device.active 
    });
    setIsEditorOpen(true);
  };

  const handleCodeChange = (value: string) => {
    setFormData(f => ({ ...f, code: value }));
    // Inline duplicate check against the already-loaded device list
    const duplicate = (devices ?? []).find(
      d => d.code === value.trim() && d.id !== editingRecord?.id
    );
    setCodeError(
      duplicate
        ? `Code "${value.trim()}" is already used by another device. Choose a different code.`
        : null,
    );
  };

  const confirmDelete = (device: Device) => {
    setDeleteRecord(device);
    setIsDeleteOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code) {
      toast({ title: 'Validation Error', description: 'Device code is required', variant: 'destructive' });
      return;
    }
    if (!selectedPropertyId) return;

    try {
      const payload = {
        code: formData.code,
        ipAddress: formData.ipAddress || undefined,
        setupIp: formData.setupIp || undefined,
        description: formData.description || undefined,
        floorId: formData.floorId !== '0' ? parseInt(formData.floorId, 10) : undefined,
        active: formData.active,
        propertyId: selectedPropertyId
      };

      if (editingRecord) {
        await updateMutation.mutateAsync({ id: editingRecord.id, data: payload });
        toast({ title: 'Device updated successfully' });
      } else {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: 'Device created successfully. 16 channels provisioned.' });
      }
      queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey({ propertyId: selectedPropertyId }) });
      setIsEditorOpen(false);
    } catch (err: any) {
      toast({ title: 'Error saving device', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingRecord || !selectedPropertyId) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingRecord.id });
      toast({ title: 'Device deleted successfully' });
      queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey({ propertyId: selectedPropertyId }) });
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Error deleting device', description: err.message, variant: 'destructive' });
    }
  };

  if (!selectedPropertyId) return <div className="p-8 text-center text-gray-500">Please select a property first.</div>;
  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Relay Devices</h1>
          <p className="text-sm text-gray-500">Manage hardware relay boxes.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Add Device
        </Button>
      </div>

      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Setup IP</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead className="w-[140px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices?.length ? (
              devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>
                    {device.online ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <Wifi className="mr-1 h-3 w-3" /> Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        <WifiOff className="mr-1 h-3 w-3" /> Offline
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {device.code}
                    <p className="text-xs text-gray-500 mt-0.5">{device.channelCount} channels</p>
                  </TableCell>
                  <TableCell>{device.ipAddress || '—'}</TableCell>
                  <TableCell>{device.setupIp || '—'}</TableCell>
                  <TableCell>{device.floorName || '—'}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {device.lastSeenAt ? formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true }) : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild title="Configure Channels">
                        <Link href={`/devices/${device.id}`}>
                          <Settings className="h-4 w-4 text-primary" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(device)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => confirmDelete(device)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-gray-500">No devices found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{editingRecord ? 'Edit Device' : 'New Device'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Device Code (MAC/Serial)</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="e.g. 000001"
                  className={codeError ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {codeError && (
                  <p className="text-xs text-destructive">{codeError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip">IP Address (Static)</Label>
                <Input id="ip" value={formData.ipAddress} onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })} placeholder="192.168.1.100" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setupIp">ESP32 Setup IP (config hotspot)</Label>
              <Input id="setupIp" value={formData.setupIp} onChange={(e) => setFormData({ ...formData, setupIp: e.target.value })} placeholder="192.168.250.217" />
              <p className="text-xs text-gray-500">The config page address shown when connected to the chip's setup WiFi. Update it after each chip reset.</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Input id="desc" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="e.g. 1st Floor Corridor Panel" />
            </div>

            <div className="space-y-2">
              <Label>Location (Floor)</Label>
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
              <Label htmlFor="active">Active Device</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending || !!codeError}>
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Device'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{deletingRecord?.code}" and all its configured channels.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting...' : 'Delete'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
