import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { 
  useGetDevice,
  useListControls,
  useUpdateControl,
  useBulkUpdateControls,
  getListControlsQueryKey,
  getGetDeviceQueryKey,
  getListRoomsQueryKey,
  getListControlTypesQueryKey,
  useListRooms,
  useListControlTypes,
  Control
} from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Save, Wifi, WifiOff, X, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BulkAssignDialog, BulkAssignItem } from './BulkAssignControls';

function ChannelRow({ 
  control, 
  rooms, 
  controlTypes, 
  onSave 
}: { 
  control: Control; 
  rooms: any[]; 
  controlTypes: any[]; 
  onSave: (id: number, data: any) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    label: control.label || '',
    roomId: control.roomId?.toString() || '0',
    controlTypeId: control.controlTypeId?.toString() || '0'
  });

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(control.id, {
      label: formData.label || null,
      roomId: formData.roomId !== '0' ? parseInt(formData.roomId, 10) : null,
      controlTypeId: formData.controlTypeId !== '0' ? parseInt(formData.controlTypeId, 10) : null,
    });
    setIsSaving(false);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="grid grid-cols-12 items-center gap-4 py-3 border-b px-4 bg-gray-50/80">
        <div className="col-span-1 text-sm font-medium text-gray-500">Ch {control.channel}</div>
        <div className="col-span-3 min-w-0">
          <Input 
            value={formData.label} 
            onChange={(e) => setFormData({ ...formData, label: e.target.value })} 
            placeholder="Label (e.g. Main AC)" 
            className="h-8"
          />
        </div>
        <div className="col-span-3 min-w-0">
          <Select value={formData.roomId} onValueChange={(v) => setFormData({ ...formData, roomId: v })}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Assign Room" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Unassigned (None)</SelectItem>
              {rooms.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.roomNo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 min-w-0">
          <Select value={formData.controlTypeId} onValueChange={(v) => setFormData({ ...formData, controlTypeId: v })}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Unassigned (None)</SelectItem>
              {controlTypes.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-1" />
        <div className="col-span-2 flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={() => setIsEditing(false)} disabled={isSaving} title="Cancel">
            <X className="h-4 w-4" />
          </Button>
          <Button size="icon" className="h-8 w-8" onClick={handleSave} disabled={isSaving} title="Save">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 items-center gap-4 py-3 border-b px-4 hover:bg-gray-50">
      <div className="col-span-1 text-sm font-medium text-gray-500">Ch {control.channel}</div>
      <div className="col-span-3 font-medium">{control.label || <span className="text-gray-400 italic">Unlabeled</span>}</div>
      <div className="col-span-3 text-sm">{control.roomNo ? `Room ${control.roomNo}` : <span className="text-gray-400">—</span>}</div>
      <div className="col-span-2 text-sm">{control.controlTypeName || <span className="text-gray-400">—</span>}</div>
      <div className="col-span-1">
        <div className={`h-3 w-3 rounded-full ${control.state ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-300'}`} title={control.state ? 'ON' : 'OFF'} />
      </div>
      <div className="col-span-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>Edit</Button>
      </div>
    </div>
  );
}

export function DeviceDetail() {
  const params = useParams();
  const deviceId = parseInt(params.id || '0', 10);
  const { selectedPropertyId } = useProperty();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: device, isLoading: deviceLoading } = useGetDevice(deviceId, { query: { enabled: !!deviceId, queryKey: getGetDeviceQueryKey(deviceId) } });
  const { data: controls, isLoading: controlsLoading } = useListControls({ deviceId }, { query: { enabled: !!deviceId, queryKey: getListControlsQueryKey({ deviceId }) } });
  
  const { data: rooms } = useListRooms({ propertyId: selectedPropertyId! }, { query: { enabled: !!selectedPropertyId, queryKey: getListRoomsQueryKey({ propertyId: selectedPropertyId! }) } });
  const { data: controlTypes } = useListControlTypes({ propertyId: selectedPropertyId! }, { query: { enabled: !!selectedPropertyId, queryKey: getListControlTypesQueryKey({ propertyId: selectedPropertyId! }) } });

  const updateControl = useUpdateControl();
  const bulkUpdate = useBulkUpdateControls();
  const [bulkOpen, setBulkOpen] = useState(false);

  const handleUpdateChannel = async (id: number, data: any) => {
    try {
      await updateControl.mutateAsync({ id, data });
      queryClient.invalidateQueries({ queryKey: getListControlsQueryKey({ deviceId }) });
      toast({ title: 'Channel configured' });
    } catch (err: any) {
      toast({ title: 'Error saving channel', description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkSave = async (items: BulkAssignItem[]) => {
    try {
      await bulkUpdate.mutateAsync({ data: { items } });
      queryClient.invalidateQueries({ queryKey: getListControlsQueryKey({ deviceId }) });
      toast({ title: 'Channels updated', description: `${items.length} channels saved.` });
    } catch (err: any) {
      toast({ title: 'Error saving channels', description: err.message, variant: 'destructive' });
      throw err;
    }
  };

  if (deviceLoading || controlsLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!device) {
    return <div className="p-8 text-center text-gray-500">Device not found.</div>;
  }

  const slate1Controls = controls?.filter(c => c.slate === 1) || [];
  const slate2Controls = controls?.filter(c => c.slate === 2) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/devices"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
            {device.code}
            {device.online ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                <Wifi className="mr-1 h-3 w-3" /> Online
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                <WifiOff className="mr-1 h-3 w-3" /> Offline
              </Badge>
            )}
          </h1>
          <p className="text-sm text-gray-500">Channel configuration ({device.description || 'No description'})</p>
        </div>
        <div className="ml-auto">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <ListChecks className="mr-2 h-4 w-4" /> Bulk assign
          </Button>
        </div>
      </div>

      <BulkAssignDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        controls={controls || []}
        rooms={rooms || []}
        controlTypes={controlTypes || []}
        deviceCode={device.code}
        onSave={handleBulkSave}
      />

      <div className="grid md:grid-cols-2 gap-8">
        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b font-medium text-gray-700 flex justify-between">
            <span>Slate 1 (Channels 1-8)</span>
          </div>
          <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-1">Ch</div>
            <div className="col-span-3">Label</div>
            <div className="col-span-3">Room</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-1">State</div>
            <div className="col-span-2"></div>
          </div>
          <div className="divide-y">
            {slate1Controls.map(c => (
              <ChannelRow 
                key={c.id} 
                control={c} 
                rooms={rooms || []} 
                controlTypes={controlTypes || []} 
                onSave={handleUpdateChannel} 
              />
            ))}
          </div>
        </div>

        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b font-medium text-gray-700 flex justify-between">
            <span>Slate 2 (Channels 9-16)</span>
          </div>
          <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-1">Ch</div>
            <div className="col-span-3">Label</div>
            <div className="col-span-3">Room</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-1">State</div>
            <div className="col-span-2"></div>
          </div>
          <div className="divide-y">
            {slate2Controls.map(c => (
              <ChannelRow 
                key={c.id} 
                control={c} 
                rooms={rooms || []} 
                controlTypes={controlTypes || []} 
                onSave={handleUpdateChannel} 
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
