import { useState, useRef } from 'react';
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
  useSendControlCommand,
  useSendDeviceCommand,
  Control
} from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Camera, Loader2, Save, Trash2, Wifi, WifiOff, X, ListChecks, Power, PowerOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BulkAssignDialog, BulkAssignItem } from './BulkAssignControls';

/** Converts the objectPath stored in DB to the URL the browser can fetch. */
function photoSrc(objectPath: string) {
  return `/api/storage${objectPath}`;
}

function ChannelRow({ 
  control, 
  rooms, 
  controlTypes, 
  onSave,
  onToggle,
  toggling,
  deviceOnline
}: { 
  control: Control; 
  rooms: any[]; 
  controlTypes: any[]; 
  onSave: (id: number, data: any) => Promise<void>;
  onToggle: (control: Control, on: boolean) => void;
  toggling: boolean;
  deviceOnline: boolean;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isQuickUploading, setIsQuickUploading] = useState(false);
  const [formData, setFormData] = useState({
    label: control.label || '',
    roomId: control.roomId?.toString() || '0',
    controlTypeId: control.controlTypeId?.toString() || '0',
    wattage: control.wattage?.toString() || '',
    photoUrl: control.photoUrl ?? null as string | null,
  });

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(control.id, {
      label: formData.label || null,
      roomId: formData.roomId !== '0' ? parseInt(formData.roomId, 10) : null,
      controlTypeId: formData.controlTypeId !== '0' ? parseInt(formData.controlTypeId, 10) : null,
      wattage: formData.wattage !== '' ? parseInt(formData.wattage, 10) || null : null,
      photoUrl: formData.photoUrl ?? null,
    });
    setIsSaving(false);
    setIsEditing(false);
  };

  /** Quick upload from view mode — uploads photo and auto-saves just the photoUrl. */
  const handleQuickFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Images only', description: 'Please select a JPEG, PNG, or similar image.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum photo size is 5 MB.', variant: 'destructive' });
      return;
    }
    setIsQuickUploading(true);
    try {
      const urlRes = await fetch('/api/storage/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadURL, objectPath } = await urlRes.json();
      const putRes = await fetch(uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!putRes.ok) throw new Error('Upload to storage failed');
      // Auto-save — keep all existing field values, only update photoUrl
      await onSave(control.id, {
        label: control.label ?? null,
        roomId: control.roomId ?? null,
        controlTypeId: control.controlTypeId ?? null,
        wattage: control.wattage ?? null,
        photoUrl: objectPath,
      });
      setFormData(f => ({ ...f, photoUrl: objectPath }));
      toast({ title: 'Photo saved' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setIsQuickUploading(false);
    }
  };

  /** Two-step presigned-URL upload: request URL → PUT file → store objectPath */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected after an error
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Images only', description: 'Please select a JPEG, PNG, or similar image.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum photo size is 5 MB.', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      // Step 1: get presigned PUT URL from our API
      const urlRes = await fetch('/api/storage/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadURL, objectPath } = await urlRes.json();

      // Step 2: PUT file directly to GCS via the presigned URL
      const putRes = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error('Upload to storage failed');

      setFormData(f => ({ ...f, photoUrl: objectPath }));
      toast({ title: 'Photo uploaded', description: 'Click Save to apply.' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  if (isEditing) {
    return (
      <div className="border-b px-4 py-3 bg-gray-50/80 space-y-3">
        <div className="grid grid-cols-12 items-center gap-3">
          <div className="col-span-1 text-sm font-medium text-gray-500">Ch {control.channel}</div>
          <div className="col-span-3 min-w-0">
            <Input 
              value={formData.label} 
              onChange={(e) => setFormData({ ...formData, label: e.target.value })} 
              placeholder="Label (e.g. Main AC)" 
              className="h-8"
            />
          </div>
          <div className="col-span-2 min-w-0">
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
          <div className="col-span-1 min-w-0">
            <Input
              type="number"
              min={0}
              value={formData.wattage}
              onChange={(e) => setFormData({ ...formData, wattage: e.target.value })}
              placeholder="W"
              className="h-8"
              title="Rated wattage (for consumption reports)"
            />
          </div>
          <div className="col-span-1" />
          <div className="col-span-2 flex justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={() => { setIsEditing(false); setFormData({ label: control.label || '', roomId: control.roomId?.toString() || '0', controlTypeId: control.controlTypeId?.toString() || '0', wattage: control.wattage?.toString() || '', photoUrl: control.photoUrl ?? null }); }} disabled={isSaving} title="Cancel">
              <X className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-8 w-8" onClick={handleSave} disabled={isSaving || isUploading} title="Save">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Photo upload row */}
        <div className="flex items-center gap-3 pl-1">
          <span className="text-xs text-gray-500 w-20 shrink-0">Photo</span>
          {formData.photoUrl ? (
            <div className="relative group">
              <img
                src={photoSrc(formData.photoUrl)}
                alt="Channel photo"
                className="h-16 w-24 object-cover rounded border border-gray-200 shadow-sm"
              />
              <button
                type="button"
                onClick={() => setFormData(f => ({ ...f, photoUrl: null }))}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="h-16 w-24 rounded border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 text-gray-400">
              <Camera className="h-5 w-5" />
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Uploading…</>
              ) : (
                <><Camera className="mr-1.5 h-3 w-3" />{formData.photoUrl ? 'Replace' : 'Upload photo'}</>
              )}
            </Button>
            {formData.photoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-red-500 hover:text-red-600"
                onClick={() => setFormData(f => ({ ...f, photoUrl: null }))}
              >
                <Trash2 className="mr-1 h-3 w-3" />Remove
              </Button>
            )}
          </div>
          <span className="text-xs text-gray-400">JPEG/PNG · max 5 MB</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 items-center gap-4 py-3 border-b px-4 hover:bg-gray-50">
      <div className="col-span-1 text-sm font-medium text-gray-500">Ch {control.channel}</div>
      <div className="col-span-3 font-medium flex items-center gap-2">
        {/* Clickable photo thumbnail / camera icon — opens file picker directly */}
        <button
          type="button"
          onClick={() => quickFileInputRef.current?.click()}
          disabled={isQuickUploading}
          title={control.photoUrl ? 'Click to replace photo' : 'Click to add photo'}
          className="shrink-0 relative group"
        >
          {isQuickUploading ? (
            <span className="h-6 w-8 rounded border border-gray-200 flex items-center justify-center bg-gray-50">
              <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
            </span>
          ) : control.photoUrl ? (
            <img
              src={photoSrc(control.photoUrl)}
              alt=""
              className="h-6 w-8 object-cover rounded shadow-sm border border-gray-200 group-hover:opacity-75 transition-opacity"
            />
          ) : (
            <span className="h-6 w-8 rounded border border-dashed border-gray-200 flex items-center justify-center bg-gray-50 group-hover:border-primary group-hover:bg-primary/5 transition-colors">
              <Camera className="h-3 w-3 text-gray-300 group-hover:text-primary transition-colors" />
            </span>
          )}
        </button>
        <input
          ref={quickFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleQuickFileChange}
        />
        {control.label || <span className="text-gray-400 italic">Unlabeled</span>}
      </div>
      <div className="col-span-2 text-sm">{control.roomNo ? `Room ${control.roomNo}` : <span className="text-gray-400">—</span>}</div>
      <div className="col-span-2 text-sm">{control.controlTypeName || <span className="text-gray-400">—</span>}</div>
      <div className="col-span-1 text-sm">{control.wattage != null ? `${control.wattage} W` : <span className="text-gray-400">—</span>}</div>
      <div className="col-span-1 flex items-center gap-2">
        <div className={`h-3 w-3 rounded-full ${control.state ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-300'}`} title={control.state ? 'ON' : 'OFF'} />
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2">
        <Switch
          checked={control.state === 1}
          disabled={toggling}
          onCheckedChange={(on) => onToggle(control, on)}
          title={deviceOnline ? `Turn ${control.state ? 'off' : 'on'} relay` : 'Device offline — command will queue until the box polls'}
          aria-label={`Toggle channel ${control.channel}`}
        />
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
  const sendCommand = useSendControlCommand();
  const sendDeviceCommand = useSendDeviceCommand();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [bulkToggling, setBulkToggling] = useState<string | null>(null); // 'slate1-on' | 'slate1-off' | 'slate2-on' | 'slate2-off'

  const handleToggle = async (control: Control, on: boolean) => {
    setTogglingId(control.id);
    try {
      await sendCommand.mutateAsync({ id: control.id, data: { state: on ? 'on' : 'off' } });
      queryClient.invalidateQueries({ queryKey: getListControlsQueryKey({ deviceId }) });
      toast({
        title: `Relay ${on ? 'ON' : 'OFF'} command queued`,
        description: device?.online
          ? `Ch ${control.channel} (slate ${control.slate}) — the box will pick it up on its next poll.`
          : `Ch ${control.channel} (slate ${control.slate}) — device is offline; command waits in the queue until it polls.`,
      });
    } catch (err: any) {
      toast({ title: 'Failed to queue command', description: err.message, variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleUpdateChannel = async (id: number, data: any) => {
    try {
      await updateControl.mutateAsync({ id, data });
      queryClient.invalidateQueries({ queryKey: getListControlsQueryKey({ deviceId }) });
      toast({ title: 'Channel configured' });
    } catch (err: any) {
      toast({ title: 'Error saving channel', description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkSlateCommand = async (slate: number, on: boolean) => {
    const key = `slate${slate}-${on ? 'on' : 'off'}`;
    setBulkToggling(key);
    try {
      await sendDeviceCommand.mutateAsync({ data: { deviceId, slate, state: on ? 'on' : 'off' } });
      queryClient.invalidateQueries({ queryKey: getListControlsQueryKey({ deviceId }) });
      toast({
        title: `Slate ${slate} ALL ${on ? 'ON' : 'OFF'} queued`,
        description: device?.online
          ? 'The relay box will apply it on its next poll.'
          : 'Device offline — command waits in the queue.',
      });
    } catch (err: any) {
      toast({ title: 'Failed to queue command', description: err.message, variant: 'destructive' });
    } finally {
      setBulkToggling(null);
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
          <div className="bg-gray-50 px-4 py-3 border-b font-medium text-gray-700 flex items-center justify-between">
            <span>Slate 1 (Channels 1-8)</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50"
                onClick={() => handleBulkSlateCommand(1, true)}
                disabled={!!bulkToggling}>
                {bulkToggling === 'slate1-on' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                All ON
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50"
                onClick={() => handleBulkSlateCommand(1, false)}
                disabled={!!bulkToggling}>
                {bulkToggling === 'slate1-off' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PowerOff className="h-3 w-3" />}
                All OFF
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-1">Ch</div>
            <div className="col-span-3">Label</div>
            <div className="col-span-2">Room</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-1">Watts</div>
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
                onToggle={handleToggle}
                toggling={togglingId === c.id}
                deviceOnline={!!device.online}
              />
            ))}
          </div>
        </div>

        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b font-medium text-gray-700 flex items-center justify-between">
            <span>Slate 2 (Channels 9-16)</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50"
                onClick={() => handleBulkSlateCommand(2, true)}
                disabled={!!bulkToggling}>
                {bulkToggling === 'slate2-on' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                All ON
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50"
                onClick={() => handleBulkSlateCommand(2, false)}
                disabled={!!bulkToggling}>
                {bulkToggling === 'slate2-off' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PowerOff className="h-3 w-3" />}
                All OFF
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-1">Ch</div>
            <div className="col-span-3">Label</div>
            <div className="col-span-2">Room</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-1">Watts</div>
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
                onToggle={handleToggle}
                toggling={togglingId === c.id}
                deviceOnline={!!device.online}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
