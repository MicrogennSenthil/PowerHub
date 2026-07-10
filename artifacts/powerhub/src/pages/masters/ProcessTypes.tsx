import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListProcessTypes, 
  useCreateProcessType, 
  useUpdateProcessType, 
  useDeleteProcessType,
  getListProcessTypesQueryKey,
  ProcessType
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

export function ProcessTypes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = useProperty();
  
  const { data: processes, isLoading } = useListProcessTypes(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListProcessTypesQueryKey({ propertyId: selectedPropertyId! }) } }
  );
  
  const createMutation = useCreateProcessType();
  const updateMutation = useUpdateProcessType();
  const deleteMutation = useDeleteProcessType();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProcessType | null>(null);
  const [deletingRecord, setDeleteRecord] = useState<ProcessType | null>(null);

  const [formData, setFormData] = useState({ name: '', description: '', cutoffMinutes: '30', isAuto: true, active: true });

  const openNew = () => {
    setEditingRecord(null);
    setFormData({ name: '', description: '', cutoffMinutes: '30', isAuto: true, active: true });
    setIsEditorOpen(true);
  };

  const openEdit = (pt: ProcessType) => {
    setEditingRecord(pt);
    setFormData({ 
      name: pt.name, 
      description: pt.description || '', 
      cutoffMinutes: pt.cutoffMinutes.toString(), 
      isAuto: pt.isAuto, 
      active: pt.active 
    });
    setIsEditorOpen(true);
  };

  const confirmDelete = (pt: ProcessType) => {
    setDeleteRecord(pt);
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
        description: formData.description || undefined,
        cutoffMinutes: parseInt(formData.cutoffMinutes, 10) || 0,
        isAuto: formData.isAuto,
        active: formData.active,
        propertyId: selectedPropertyId
      };

      if (editingRecord) {
        await updateMutation.mutateAsync({ id: editingRecord.id, data: payload });
        toast({ title: 'Process Type updated successfully' });
      } else {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: 'Process Type created successfully' });
      }
      queryClient.invalidateQueries({ queryKey: getListProcessTypesQueryKey({ propertyId: selectedPropertyId }) });
      setIsEditorOpen(false);
    } catch (err: any) {
      toast({ title: 'Error saving process type', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingRecord || !selectedPropertyId) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingRecord.id });
      toast({ title: 'Process Type deleted successfully' });
      queryClient.invalidateQueries({ queryKey: getListProcessTypesQueryKey({ propertyId: selectedPropertyId }) });
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Error deleting process type', description: err.message, variant: 'destructive' });
    }
  };

  if (!selectedPropertyId) return <div className="p-8 text-center text-gray-500">Please select a property first.</div>;
  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Process Types</h1>
          <p className="text-sm text-gray-500">Auto-cutoff rules and workflows (e.g. Cleaning, Checkout).</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Add Process
        </Button>
      </div>

      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Process Name</TableHead>
              <TableHead>Auto Cutoff Timer</TableHead>
              <TableHead>Auto Mode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processes?.length ? (
              processes.map((pt) => (
                <TableRow key={pt.id}>
                  <TableCell className="font-medium">
                    {pt.name}
                    <div className="text-xs text-gray-500 mt-0.5">{pt.description}</div>
                  </TableCell>
                  <TableCell>{pt.cutoffMinutes} mins</TableCell>
                  <TableCell>
                    {pt.isAuto ? <Badge variant="outline" className="bg-blue-50 text-blue-700">Auto Cutoff</Badge> : <Badge variant="outline" className="bg-gray-100 text-gray-600">Manual</Badge>}
                  </TableCell>
                  <TableCell>
                    {pt.active ? <Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge> : <Badge variant="outline" className="bg-gray-100 text-gray-600">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(pt)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => confirmDelete(pt)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-gray-500">No process types found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>{editingRecord ? 'Edit Process Type' : 'New Process Type'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Process Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Cleaning, VIP Visiting" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Input id="desc" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Short description" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cutoff">Cutoff Timer (Minutes)</Label>
              <Input id="cutoff" type="number" value={formData.cutoffMinutes} onChange={(e) => setFormData({ ...formData, cutoffMinutes: e.target.value })} />
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Switch id="auto" checked={formData.isAuto} onCheckedChange={(c) => setFormData({ ...formData, isAuto: c })} />
              <Label htmlFor="auto">Enable Auto Cutoff</Label>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Switch id="active" checked={formData.active} onCheckedChange={(c) => setFormData({ ...formData, active: c })} />
              <Label htmlFor="active">Active Process</Label>
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
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{deletingRecord?.name}". Ensure it is not assigned to active controls.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting...' : 'Delete'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
