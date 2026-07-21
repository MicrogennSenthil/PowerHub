import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListAdminProperties,
  useUpdateAdminProperty,
  useListPropertyInvoices,
  useCreatePropertyInvoice,
  getListAdminPropertiesQueryKey,
  getListPropertyInvoicesQueryKey,
  PropertyAdmin,
  PropertyInvoice,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Building2, Users2, Cpu, CreditCard, Plus, Edit2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function planBadge(tier: string) {
  const cls: Record<string, string> = {
    trial: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    starter: 'bg-blue-50 text-blue-700 border-blue-200',
    pro: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return <Badge variant="outline" className={cls[tier] ?? ''}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</Badge>;
}

function billingBadge(status: string) {
  const cls: Record<string, string> = {
    trial: 'bg-yellow-50 text-yellow-700',
    active: 'bg-green-50 text-green-700',
    suspended: 'bg-red-50 text-red-700',
  };
  return <Badge variant="outline" className={cls[status] ?? ''}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

interface ManageDialogProps {
  property: PropertyAdmin;
  onClose: () => void;
}

function ManageDialog({ property, onClose }: ManageDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateAdminProperty();
  const createInvoiceMutation = useCreatePropertyInvoice();
  const { data: invoices, isLoading: invLoading } = useListPropertyInvoices(
    property.id,
    { query: { queryKey: getListPropertyInvoicesQueryKey(property.id) } }
  );

  const [billing, setBilling] = useState({
    planTier: property.planTier,
    billingStatus: property.billingStatus,
    maxUsers: property.maxUsers,
    maxDevices: property.maxDevices,
    trialEndsAt: property.trialEndsAt ? property.trialEndsAt.slice(0, 10) : '',
    nextBillingAt: property.nextBillingAt ? property.nextBillingAt.slice(0, 10) : '',
  });

  const [inv, setInv] = useState({ amount: '', currency: property.currency, description: '', paidAt: '' });

  const saveBilling = async () => {
    try {
      await updateMutation.mutateAsync({
        id: property.id,
        data: {
          planTier: billing.planTier as any,
          billingStatus: billing.billingStatus as any,
          maxUsers: Number(billing.maxUsers),
          maxDevices: Number(billing.maxDevices),
          trialEndsAt: billing.trialEndsAt ? new Date(billing.trialEndsAt).toISOString() : null,
          nextBillingAt: billing.nextBillingAt ? new Date(billing.nextBillingAt).toISOString() : null,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListAdminPropertiesQueryKey() });
      toast({ title: 'Billing updated' });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const addInvoice = async () => {
    if (!inv.amount || isNaN(Number(inv.amount))) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' }); return;
    }
    try {
      await createInvoiceMutation.mutateAsync({
        id: property.id,
        data: {
          amount: Number(inv.amount),
          currency: inv.currency,
          description: inv.description || undefined,
          paidAt: inv.paidAt ? new Date(inv.paidAt).toISOString() : null,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListPropertyInvoicesQueryKey(property.id) });
      setInv({ amount: '', currency: property.currency, description: '', paidAt: '' });
      toast({ title: 'Invoice added' });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {property.name} <span className="text-sm font-normal text-gray-400">({property.code})</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="billing">
          <TabsList className="w-full">
            <TabsTrigger value="billing" className="flex-1">Subscription & Limits</TabsTrigger>
            <TabsTrigger value="invoices" className="flex-1">Invoices</TabsTrigger>
          </TabsList>

          {/* ─── Billing tab ─── */}
          <TabsContent value="billing" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan Tier</Label>
                <Select value={billing.planTier} onValueChange={v => setBilling({ ...billing, planTier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Billing Status</Label>
                <Select value={billing.billingStatus} onValueChange={v => setBilling({ ...billing, billingStatus: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max Users</Label>
                <Input type="number" min={1} value={billing.maxUsers} onChange={e => setBilling({ ...billing, maxUsers: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Max Devices</Label>
                <Input type="number" min={1} value={billing.maxDevices} onChange={e => setBilling({ ...billing, maxDevices: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Trial Ends At</Label>
                <Input type="date" value={billing.trialEndsAt} onChange={e => setBilling({ ...billing, trialEndsAt: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Next Billing Date</Label>
                <Input type="date" value={billing.nextBillingAt} onChange={e => setBilling({ ...billing, nextBillingAt: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveBilling} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving…' : 'Save Subscription'}
              </Button>
            </div>
          </TabsContent>

          {/* ─── Invoices tab ─── */}
          <TabsContent value="invoices" className="space-y-4 pt-4">
            <div className="rounded-md border p-4 space-y-3 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">Add Invoice</p>
              <div className="grid grid-cols-3 gap-3">
                <Input placeholder="Amount" type="number" value={inv.amount} onChange={e => setInv({ ...inv, amount: e.target.value })} />
                <Input placeholder="Description" value={inv.description} onChange={e => setInv({ ...inv, description: e.target.value })} />
                <Input type="date" value={inv.paidAt} onChange={e => setInv({ ...inv, paidAt: e.target.value })} title="Paid At" />
              </div>
              <Button size="sm" onClick={addInvoice} disabled={createInvoiceMutation.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {invLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-gray-400" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Paid At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-gray-400">No invoices yet.</TableCell></TableRow>
                  )}
                  {(invoices ?? []).map((inv: PropertyInvoice) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-sm">{new Date(inv.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">{inv.description ?? '—'}</TableCell>
                      <TableCell className="text-right font-medium">{inv.currency} {inv.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-sm">{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : <span className="text-gray-400">Unpaid</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PropertyManagement() {
  const { data: properties, isLoading } = useListAdminProperties();
  const [managing, setManaging] = useState<PropertyAdmin | null>(null);

  const totals = {
    properties: properties?.length ?? 0,
    users: properties?.reduce((s, p) => s + p.userCount, 0) ?? 0,
    devices: properties?.reduce((s, p) => s + p.deviceCount, 0) ?? 0,
    active: properties?.filter(p => p.billingStatus === 'active').length ?? 0,
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Property Management</h1>
        <p className="text-sm text-gray-500">Super-admin view of all tenants, subscription plans, and billing.</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Properties', value: totals.properties, icon: Building2, color: 'text-blue-600' },
          { label: 'Total Users', value: totals.users, icon: Users2, color: 'text-green-600' },
          { label: 'Total Devices', value: totals.devices, icon: Cpu, color: 'text-purple-600' },
          { label: 'Active Subscriptions', value: totals.active, icon: CreditCard, color: 'text-orange-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Properties table */}
      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead className="text-center">Users</TableHead>
              <TableHead className="text-center">Devices</TableHead>
              <TableHead>Trial / Next Bill</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(properties ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-gray-500">No properties found.</TableCell></TableRow>
            )}
            {(properties ?? []).map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-400">{p.code} · {p.city ?? '—'}</div>
                </TableCell>
                <TableCell>{planBadge(p.planTier)}</TableCell>
                <TableCell>{billingBadge(p.billingStatus)}</TableCell>
                <TableCell className="text-center">
                  <span className={p.userCount >= p.maxUsers ? 'text-red-600 font-semibold' : ''}>
                    {p.userCount}/{p.maxUsers}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className={p.deviceCount >= p.maxDevices ? 'text-red-600 font-semibold' : ''}>
                    {p.deviceCount}/{p.maxDevices}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-gray-500">
                  {p.trialEndsAt ? <>Trial: {new Date(p.trialEndsAt).toLocaleDateString()}</> :
                   p.nextBillingAt ? <>Bill: {new Date(p.nextBillingAt).toLocaleDateString()}</> : '—'}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => setManaging(p)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {managing && <ManageDialog property={managing} onClose={() => setManaging(null)} />}
    </div>
  );
}
