import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListProperties, 
  useCreateProperty, 
  useUpdateProperty, 
  useDeleteProperty,
  useGetSettings,
  getGetSettingsQueryKey,
  getListPropertiesQueryKey,
  Property
} from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Common IANA timezones offered in the property form. The property's current
// value is always included even if it isn't in this list (see options below).
const TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Karachi',
  'Asia/Colombo',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Africa/Johannesburg',
  'Pacific/Auckland',
];

export function Properties() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setSelectedPropertyId } = useProperty();
  
  const { data: properties, isLoading } = useListProperties();
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const codeMode = settings?.propertyCodeMode === 'auto' ? 'auto' : 'manual';

  const createMutation = useCreateProperty();
  const updateMutation = useUpdateProperty();
  const deleteMutation = useDeleteProperty();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Property | null>(null);
  const [deletingRecord, setDeleteRecord] = useState<Property | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    pincode: '',
    email: '',
    phone: '',
    currency: 'USD',
    tariffPerKwh: '0.15',
    timezone: 'UTC',
    active: true,
    mhmsApiUrl: '',
    mhmsApiKey: '',
  });

  const openNew = () => {
    setEditingRecord(null);
    setFormData({
      name: '',
      code: '',
      address: '',
      city: '',
      pincode: '',
      email: '',
      phone: '',
      currency: 'USD',
      tariffPerKwh: '0.15',
      timezone: 'UTC',
      active: true,
      mhmsApiUrl: '',
      mhmsApiKey: '',
    });
    setIsEditorOpen(true);
  };

  const openEdit = (property: Property) => {
    setEditingRecord(property);
    setFormData({
      name: property.name,
      code: property.code,
      address: property.address || '',
      city: property.city || '',
      pincode: property.pincode || '',
      email: property.email || '',
      phone: property.phone || '',
      currency: property.currency,
      tariffPerKwh: property.tariffPerKwh.toString(),
      timezone: property.timezone,
      active: property.active,
      mhmsApiUrl: property.mhmsApiUrl || '',
      mhmsApiKey: '',   // never pre-fill the key; treat like a password
    });
    setIsEditorOpen(true);
  };

  const confirmDelete = (property: Property) => {
    setDeleteRecord(property);
    setIsDeleteOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast({ title: 'Validation Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    if (codeMode === 'manual' && !formData.code) {
      toast({ title: 'Validation Error', description: 'Code is required', variant: 'destructive' });
      return;
    }

    try {
      const payload = {
        ...formData,
        tariffPerKwh: parseFloat(formData.tariffPerKwh) || 0
      };

      if (editingRecord) {
        await updateMutation.mutateAsync({ id: editingRecord.id, data: payload });
        toast({ title: 'Property updated successfully' });
      } else {
        const newProp = await createMutation.mutateAsync({ data: payload });
        setSelectedPropertyId(newProp.id);
        toast({ title: 'Property created successfully' });
      }
      queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
      setIsEditorOpen(false);
    } catch (err: any) {
      toast({ title: 'Error saving property', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingRecord) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingRecord.id });
      toast({ title: 'Property deleted successfully' });
      queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Error deleting property', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500">Manage hotel properties and basic settings.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Add Property
        </Button>
      </div>

      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Tariff/kWh</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties?.length ? (
              properties.map((property) => (
                <TableRow key={property.id}>
                  <TableCell className="font-medium">{property.code}</TableCell>
                  <TableCell>{property.name}</TableCell>
                  <TableCell>{property.city || '—'}</TableCell>
                  <TableCell>{property.currency}</TableCell>
                  <TableCell>{property.tariffPerKwh}</TableCell>
                  <TableCell>
                    {property.active ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-100 text-gray-600">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(property)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => confirmDelete(property)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-gray-500">
                  No properties found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Edit Property' : 'New Property'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">
                  {codeMode === 'auto' ? 'Code (Auto-generated)' : 'Code (Unique)'}
                </Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder={codeMode === 'auto' ? 'Auto-generated on save' : 'e.g. SF-01'}
                  disabled={codeMode === 'auto'}
                />
                {codeMode === 'auto' && !editingRecord && (
                  <p className="text-xs text-gray-500">
                    A unique code will be assigned automatically.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Hotel Name" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pincode">Pincode</Label>
                <Input id="pincode" value={formData.pincode} onChange={(e) => setFormData({ ...formData, pincode: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tariff">Tariff / kWh</Label>
                <Input id="tariff" type="number" step="0.01" value={formData.tariffPerKwh} onChange={(e) => setFormData({ ...formData, tariffPerKwh: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={formData.timezone} onValueChange={(v) => setFormData({ ...formData, timezone: v })}>
                  <SelectTrigger id="timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {(TIMEZONES.includes(formData.timezone) ? TIMEZONES : [formData.timezone, ...TIMEZONES]).map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2 mt-4">
              <Switch id="active" checked={formData.active} onCheckedChange={(c) => setFormData({ ...formData, active: c })} />
              <Label htmlFor="active">Active Property</Label>
            </div>

            {/* MHMS integration */}
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3 mt-2">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">MHMS Integration (Room Import)</p>
              <div className="space-y-2">
                <Label htmlFor="mhmsApiUrl" className="text-sm">MHMS Server URL</Label>
                <Input
                  id="mhmsApiUrl"
                  value={formData.mhmsApiUrl}
                  onChange={(e) => setFormData({ ...formData, mhmsApiUrl: e.target.value })}
                  placeholder="http://192.168.1.100/mhms"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-blue-600">Base URL of the MHMS server. PowerHub will call <code className="bg-blue-100 px-1 rounded">{'{url}'}/api/rooms</code> to fetch the room list.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mhmsApiKey" className="text-sm">
                  MHMS API Key
                  {editingRecord?.mhmsApiKeySet && <span className="ml-2 text-green-600 text-xs font-normal">✓ key saved</span>}
                </Label>
                <Input
                  id="mhmsApiKey"
                  type="password"
                  value={formData.mhmsApiKey}
                  onChange={(e) => setFormData({ ...formData, mhmsApiKey: e.target.value })}
                  placeholder={editingRecord?.mhmsApiKeySet ? '(leave blank to keep current)' : 'API key provided by MHMS team'}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Property'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the property "{deletingRecord?.name}". All associated rooms and devices will be unlinked or deleted based on constraints.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
