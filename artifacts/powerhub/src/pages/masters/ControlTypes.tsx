import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListControlTypes, 
  useCreateControlType, 
  useUpdateControlType, 
  useDeleteControlType,
  getListControlTypesQueryKey,
  ControlType
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
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function ControlTypes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = useProperty();
  
  const { data: controlTypes, isLoading } = useListControlTypes(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListControlTypesQueryKey({ propertyId: selectedPropertyId! }) } }
  );
  
  const createMutation = useCreateControlType();
  const updateMutation = useUpdateControlType();
  const deleteMutation = useDeleteControlType();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ControlType | null>(null);
  const [deletingRecord, setDeleteRecord] = useState<ControlType | null>(null);

  const [formData, setFormData] = useState({ name: '', powerRatingWatts: '0', active: true });

  const openNew = () => {
    setEditingRecord(null);
    setFormData({ name: '', powerRatingWatts: '0', active: true });
    setIsEditorOpen(true);
  };

  const openEdit = (controlType: ControlType) => {
    setEditingRecord(controlType);
    setFormData({ name: controlType.name, powerRatingWatts: controlType.powerRatingWatts.toString(), active: controlType.active });
    setIsEditorOpen(true);
  };

  const confirmDelete = (controlType: ControlType) => {
    setDeleteRecord(controlType);
    setIsDeleteOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast({ title: 'Validation Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!selectedPropertyId) return;

    try {
      const payload = {
        name: formData.name,
        powerRatingWatts: parseInt(formData.powerRatingWatts, 10) || 0,
        active: formData.active,
        propertyId: selectedPropertyId
      };

      if (editingRecord) {
        await updateMutation.mutateAsync({ id: editingRecord.id, data: payload });
        toast({ title: 'Control Type updated successfully' });
      } else {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: 'Control Type created successfully' });
      }
      queryClient.invalidateQueries({ queryKey: getListControlTypesQueryKey({ propertyId: selectedPropertyId }) });
      setIsEditorOpen(false);
    } catch (err: any) {
      toast({ title: 'Error saving control type', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingRecord || !selectedPropertyId) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingRecord.id });
      toast({ title: 'Control Type deleted successfully' });
      queryClient.invalidateQueries({ queryKey: getListControlTypesQueryKey({ propertyId: selectedPropertyId }) });
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Error deleting control type', description: err.message, variant: 'destructive' });
    }
  };

  if (!selectedPropertyId) return <div className="p-8 text-center text-gray-500">Please select a property first.</div>;
  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Control Types</h1>
          <p className="text-sm text-gray-500">Define loads/appliances connected to the relays (e.g., AC, Geyser, Lights).</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Add Type
        </Button>
      </div>

      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Power Rating (Watts)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {controlTypes?.length ? (
              controlTypes.map((ct) => (
                <TableRow key={ct.id}>
                  <TableCell className="font-medium">{ct.name}</TableCell>
                  <TableCell>{ct.powerRatingWatts} W</TableCell>
                  <TableCell>
                    {ct.active ? <Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge> : <Badge variant="outline" className="bg-gray-100 text-gray-600">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(ct)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => confirmDelete(ct)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-gray-500">No control types found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>{editingRecord ? 'Edit Control Type' : 'New Control Type'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Air Conditioner" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rating">Power Rating (Watts)</Label>
              <Input id="rating" type="number" value={formData.powerRatingWatts} onChange={(e) => setFormData({ ...formData, powerRatingWatts: e.target.value })} placeholder="e.g. 1500" />
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
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{deletingRecord?.name}".</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting...' : 'Delete'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
