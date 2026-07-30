import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListUsers, 
  useCreateUser, 
  useUpdateUser, 
  useDeleteUser,
  getListUsersQueryKey,
  useListRoles,
  getListRolesQueryKey,
  useListProperties,
  AppUser
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useProperty } from '@/contexts/PropertyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Edit2, Trash2, ShieldCheck, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = useProperty();
  
  const { data: users, isLoading } = useListUsers();
  // Roles are property-scoped — only show roles for the currently selected property.
  const { data: roles } = useListRoles(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListRolesQueryKey({ propertyId: selectedPropertyId! }) } }
  );
  const { data: properties } = useListProperties();
  
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AppUser | null>(null);
  const [deletingRecord, setDeleteRecord] = useState<AppUser | null>(null);

  const [formData, setFormData] = useState({ 
    email: '', 
    name: '', 
    phone: '',
    roleId: '0', 
    isSuperAdmin: false, 
    active: true,
    propertyIds: [] as number[]
  });

  const openNew = () => {
    setEditingRecord(null);
    setFormData({ email: '', name: '', phone: '', roleId: '0', isSuperAdmin: false, active: true, propertyIds: [] });
    setIsEditorOpen(true);
  };

  const openEdit = (user: AppUser) => {
    setEditingRecord(user);
    setFormData({ 
      email: user.email, 
      name: user.name, 
      phone: (user as any).phone ?? '',
      roleId: user.roleId?.toString() || '0', 
      isSuperAdmin: user.isSuperAdmin, 
      active: user.active,
      propertyIds: [...user.propertyIds]
    });
    setIsEditorOpen(true);
  };

  const confirmDelete = (user: AppUser) => {
    setDeleteRecord(user);
    setIsDeleteOpen(true);
  };

  const toggleProperty = (id: number) => {
    setFormData(prev => {
      if (prev.propertyIds.includes(id)) {
        return { ...prev, propertyIds: prev.propertyIds.filter(pid => pid !== id) };
      } else {
        return { ...prev, propertyIds: [...prev.propertyIds, id] };
      }
    });
  };

  const handleSave = async () => {
    if (!formData.email || !formData.name) {
      toast({ title: 'Validation Error', description: 'Name and Email are required', variant: 'destructive' });
      return;
    }

    try {
      if (editingRecord) {
        // Can't edit email in update payload typically, but let's pass what API expects
        const payload = {
          name: formData.name,
          phone: formData.phone.trim() || null,
          roleId: formData.roleId !== '0' ? parseInt(formData.roleId, 10) : null,
          isSuperAdmin: formData.isSuperAdmin,
          active: formData.active,
          propertyIds: formData.propertyIds
        };
        await updateMutation.mutateAsync({ id: editingRecord.id, data: payload });
        toast({ title: 'User updated successfully' });
      } else {
        const payload = {
          email: formData.email,
          name: formData.name,
          phone: formData.phone.trim() || undefined,
          roleId: formData.roleId !== '0' ? parseInt(formData.roleId, 10) : undefined,
          isSuperAdmin: formData.isSuperAdmin,
          active: formData.active,
          propertyIds: formData.propertyIds
        };
        await createMutation.mutateAsync({ data: payload });
        toast({ title: 'User created successfully' });
      }
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setIsEditorOpen(false);
    } catch (err: any) {
      toast({ title: 'Error saving user', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingRecord) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingRecord.id });
      toast({ title: 'User deleted successfully' });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setIsDeleteOpen(false);
    } catch (err: any) {
      toast({ title: 'Error deleting user', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">Manage dashboard access and property assignments.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Invite User
        </Button>
      </div>

      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Property Access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.length ? (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium text-gray-900">{user.name}</div>
                    <div className="text-sm text-gray-500 flex items-center mt-0.5"><Mail className="mr-1 h-3 w-3" />{user.email}</div>
                  </TableCell>
                  <TableCell>
                    {user.isSuperAdmin ? (
                      <div className="flex items-center text-blue-700 font-medium text-sm"><ShieldCheck className="mr-1 h-4 w-4" /> Super Admin</div>
                    ) : (
                      <span className="font-medium">{user.roleName || <span className="text-gray-400 italic">None</span>}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.isSuperAdmin ? (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50">All Properties</Badge>
                    ) : (
                      <div className="text-sm">
                        {user.propertyIds.length > 0 ? (
                          <span className="font-medium text-gray-700">{user.propertyIds.length} allocated</span>
                        ) : (
                          <span className="text-gray-400">None</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.active ? <Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge> : <Badge variant="outline" className="bg-gray-100 text-gray-600">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(user)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => confirmDelete(user)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-gray-500">No users found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>{editingRecord ? 'Edit User' : 'Invite User'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. John Doe" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={!!editingRecord} placeholder="For login via Clerk" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="phone">WhatsApp Phone Number</Label>
                <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="e.g. 919876543210 (with country code, no spaces)" />
                <p className="text-xs text-gray-500">Used for WhatsApp OTP sign-in and password reset. Include country code (e.g. 91 for India).</p>
              </div>
            </div>

            <div className="flex items-center space-x-2 mt-2 p-3 bg-blue-50 border border-blue-100 rounded-md">
              <Switch id="superadmin" checked={formData.isSuperAdmin} onCheckedChange={(c) => setFormData({ ...formData, isSuperAdmin: c })} />
              <div className="grid gap-1">
                <Label htmlFor="superadmin" className="font-semibold text-blue-900">Super Admin Access</Label>
                <p className="text-xs text-blue-700">Grants full access to all properties and settings globally.</p>
              </div>
            </div>

            {!formData.isSuperAdmin && (
              <>
                <div className="space-y-2">
                  <Label>Role Assignment</Label>
                  <Select value={formData.roleId} onValueChange={(v) => setFormData({ ...formData, roleId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No Role (No Access)</SelectItem>
                      {roles?.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 border rounded-md p-3">
                  <Label className="font-semibold block mb-2 border-b pb-2">Property Allocation</Label>
                  <ScrollArea className="h-[120px]">
                    <div className="grid grid-cols-2 gap-2">
                      {properties?.map(p => (
                        <div key={p.id} className="flex items-center space-x-2">
                          <Checkbox id={`prop-${p.id}`} checked={formData.propertyIds.includes(p.id)} onCheckedChange={() => toggleProperty(p.id)} />
                          <label htmlFor={`prop-${p.id}`} className="text-sm font-medium leading-none cursor-pointer">{p.name}</label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}

            <div className="flex items-center space-x-2 pt-2 border-t">
              <Switch id="active" checked={formData.active} onCheckedChange={(c) => setFormData({ ...formData, active: c })} />
              <Label htmlFor="active">Account Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>{createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the user "{deletingRecord?.name}" and revoke their access.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting...' : 'Delete'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
