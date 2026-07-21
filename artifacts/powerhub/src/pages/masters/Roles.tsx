import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListRoles, 
  useCreateRole, 
  useUpdateRole, 
  useDeleteRole,
  getListRolesQueryKey,
  useListPermissions,
  Role
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useProperty } from '@/contexts/PropertyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Shield, Lock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export function Roles() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = useProperty();

  const { data: roles, isLoading } = useListRoles(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListRolesQueryKey({ propertyId: selectedPropertyId! }) } }
  );
  const { data: permissionsCatalog } = useListPermissions();
  
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Role | null>(null);
  const [deletingRecord, setDeleteRecord] = useState<Role | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    permissions: string[];
  }>({ name: '', description: '', permissions: [] });

  const openNew = () => {
    setEditingRecord(null);
    setFormData({ name: '', description: '', permissions: [] });
    setIsEditorOpen(true);
  };

  const openEdit = (role: Role) => {
    if (role.isSystem) return;
    setEditingRecord(role);
    setFormData({ name: role.name, description: role.description || '', permissions: [...role.permissions] });
    setIsEditorOpen(true);
  };

  const confirmDelete = (role: Role) => {
    if (role.isSystem) return;
    setDeleteRecord(role);
    setIsDeleteOpen(true);
  };

  const togglePermission = (key: string) => {
    setFormData(prev => {
      const isSelected = prev.permissions.includes(key);
      return {
        ...prev,
        permissions: isSelected
          ? prev.permissions.filter(p => p !== key)
          : [...prev.permissions, key]
      };
    });
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast({ title: 'Validation Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!selectedPropertyId) {
      toast({ title: 'No property selected', variant: 'destructive' });
      return;
    }
    try {
      if (editingRecord) {
        await updateMutation.mutateAsync({ id: editingRecord.id, data: {
          name: formData.name,
          description: formData.description || undefined,
          permissions: formData.permissions
        }});
        toast({ title: 'Role updated successfully' });
      } else {
        await createMutation.mutateAsync({ data: {
          propertyId: selectedPropertyId,
          name: formData.name,
          description: formData.description || undefined,
          permissions: formData.permissions
        }});
        toast({ title: 'Role created successfully' });
      }
      queryClient.invalidateQueries({ queryKey: getListRolesQueryKey({ propertyId: selectedPropertyId }) });
      setIsEditorOpen(false);
    } catch (err: any) {
      toast({ title: 'Error saving role', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingRecord) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingRecord.id });
      toast({ title: 'Role deleted successfully' });
      queryClient.invalidateQueries({ queryKey: getListRolesQueryKey({ propertyId: selectedPropertyId! }) });
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Error deleting role', description: err.message, variant: 'destructive' });
    }
  };

  if (!selectedPropertyId) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Please select a property to manage roles.
      </div>
    );
  }

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const groupedPerms = permissionsCatalog?.reduce((acc, perm) => {
    if (!acc[perm.group]) acc[perm.group] = [];
    acc[perm.group].push(perm);
    return acc;
  }, {} as Record<string, typeof permissionsCatalog>) || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Roles & Permissions</h1>
          <p className="text-sm text-gray-500">Define access control profiles for this property's users.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Add Role
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles?.map(role => (
          <div key={role.id} className="rounded-lg border bg-white shadow-sm flex flex-col">
            <div className="p-5 border-b flex-1">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Shield className={`h-5 w-5 ${role.isSystem ? 'text-purple-500' : 'text-primary'}`} />
                  <h3 className="font-semibold text-gray-900">{role.name}</h3>
                </div>
                {role.isSystem && (
                  <div className="flex items-center text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                    <Lock className="mr-1 h-3 w-3" /> System
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-500 min-h-[40px]">{role.description || 'No description provided.'}</p>
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Permissions</p>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.slice(0, 8).map(p => (
                    <span key={p} className="inline-flex items-center rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{p}</span>
                  ))}
                  {role.permissions.length > 8 && (
                    <span className="inline-flex items-center rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-600">+{role.permissions.length - 8} more</span>
                  )}
                  {role.permissions.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No explicit permissions</span>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-3 flex justify-end gap-2 rounded-b-lg">
              <Button variant="outline" size="sm" disabled={role.isSystem} onClick={() => openEdit(role)}>Edit</Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" disabled={role.isSystem} onClick={() => confirmDelete(role)}>Delete</Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>{editingRecord ? 'Edit Role' : 'New Role'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-2 gap-4 shrink-0">
              <div className="space-y-2">
                <Label htmlFor="name">Role Name</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Front Desk" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Input id="desc" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="What can this role do?" />
              </div>
            </div>
            <div className="flex flex-col flex-1 min-h-[300px] border rounded-md overflow-hidden mt-2">
              <div className="bg-gray-50 px-4 py-2 border-b font-medium text-sm">
                Permissions Selection ({formData.permissions.length} selected)
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-6">
                  {Object.entries(groupedPerms).map(([group, perms]) => (
                    <div key={group} className="space-y-3">
                      <h4 className="text-sm font-bold text-gray-900 border-b pb-1 uppercase tracking-wider">{group}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {perms.map(perm => (
                          <div key={perm.key} className="flex items-start space-x-2">
                            <Checkbox id={perm.key} checked={formData.permissions.includes(perm.key)} onCheckedChange={() => togglePermission(perm.key)} />
                            <div className="grid gap-1.5 leading-none">
                              <label htmlFor={perm.key} className="text-sm font-medium leading-none cursor-pointer">{perm.label}</label>
                              <p className="text-[10px] text-gray-500 font-mono">{perm.key}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter className="shrink-0 mt-4">
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the role "{deletingRecord?.name}". Users with this role will lose their permissions.</AlertDialogDescription>
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
