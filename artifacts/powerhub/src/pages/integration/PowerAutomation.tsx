import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListApiKeys,
  useCreateApiKey,
  useUpdateApiKey,
  useDeleteApiKey,
  useRegenerateApiKey,
  getListApiKeysQueryKey,
  useListPowerLogs,
  getListPowerLogsQueryKey,
  ApiKey,
} from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Trash2, Copy, KeyRound, Radio, BookOpen, RefreshCw, Download } from 'lucide-react';

function CodeBlock({ children }: { children: string }) {
  const { toast } = useToast();
  return (
    <div className="group relative rounded-md bg-gray-900 p-3 font-mono text-xs text-gray-100 overflow-x-auto">
      <pre className="whitespace-pre-wrap break-all">{children}</pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-6 w-6 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => {
          navigator.clipboard.writeText(children);
          toast({ title: 'Copied to clipboard' });
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function PowerAutomation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = useProperty();

  const { data: keys, isLoading } = useListApiKeys(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListApiKeysQueryKey({ propertyId: selectedPropertyId! }) } },
  );
  const { data: logs, isFetching: logsFetching, refetch: refetchLogs } = useListPowerLogs(
    { propertyId: selectedPropertyId!, limit: 100 },
    {
      query: {
        enabled: !!selectedPropertyId,
        queryKey: getListPowerLogsQueryKey({ propertyId: selectedPropertyId!, limit: 100 }),
        refetchInterval: 10000,
      },
    },
  );

  const createMutation = useCreateApiKey();
  const updateMutation = useUpdateApiKey();
  const deleteMutation = useDeleteApiKey();
  const regenerateMutation = useRegenerateApiKey();

  const [newKeyName, setNewKeyName] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<ApiKey | null>(null);
  const [regeneratingKey, setRegeneratingKey] = useState<ApiKey | null>(null);
  const [regeneratedKey, setRegeneratedKey] = useState<string | null>(null);

  const invalidateKeys = () =>
    queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey({ propertyId: selectedPropertyId! }) });

  const handleCreate = async () => {
    if (!newKeyName.trim() || !selectedPropertyId) return;
    try {
      const result = await createMutation.mutateAsync({ data: { propertyId: selectedPropertyId, name: newKeyName.trim() } });
      setCreatedKey(result.key);
      setNewKeyName('');
      invalidateKeys();
    } catch (err: any) {
      toast({ title: 'Error creating API key', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggle = async (k: ApiKey) => {
    try {
      await updateMutation.mutateAsync({ id: k.id, data: { active: !k.active } });
      invalidateKeys();
    } catch (err: any) {
      toast({ title: 'Error updating key', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingKey) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingKey.id });
      toast({ title: 'API key deleted' });
      setDeletingKey(null);
      invalidateKeys();
    } catch (err: any) {
      toast({ title: 'Error deleting key', description: err.message, variant: 'destructive' });
    }
  };

  const handleRegenerate = async () => {
    if (!regeneratingKey) return;
    try {
      const result = await regenerateMutation.mutateAsync({ id: regeneratingKey.id });
      setRegeneratingKey(null);
      setRegeneratedKey(result.key);
      invalidateKeys();
    } catch (err: any) {
      toast({ title: 'Error regenerating key', description: err.message, variant: 'destructive' });
    }
  };

  if (!selectedPropertyId) return <div className="p-8 text-center text-gray-500">Please select a property first.</div>;

  const baseUrl = `${window.location.origin}/api`;

  const bridgeDownloadUrl = `${window.location.origin}/api/download/powerhub-bridge.zip`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Power Automation</h1>
          <p className="text-sm text-gray-500">Connect MHMS front office and relay boxes to PowerHub.</p>
        </div>
        <a href={bridgeDownloadUrl} download="powerhub-bridge.zip">
          <Button variant="outline" className="shrink-0">
            <Download className="mr-2 h-4 w-4" /> Download Bridge
          </Button>
        </a>
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys"><KeyRound className="mr-1.5 h-4 w-4" />API Keys</TabsTrigger>
          <TabsTrigger value="docs"><BookOpen className="mr-1.5 h-4 w-4" />Endpoints</TabsTrigger>
          <TabsTrigger value="logs"><Radio className="mr-1.5 h-4 w-4" />Command Queue</TabsTrigger>
        </TabsList>

        {/* ------------------------------ API KEYS ------------------------------ */}
        <TabsContent value="keys" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />New API Key</Button>
          </div>
          <div className="rounded-md border bg-white shadow-sm">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="w-[140px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys?.length ? keys.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                      <TableCell>
                        {k.active
                          ? <Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge>
                          : <Badge variant="outline" className="bg-gray-100 text-gray-600">Disabled</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setRegeneratingKey(k)} title="Regenerate key"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Regenerate</Button>
                          <Button variant="outline" size="sm" onClick={() => handleToggle(k)}>{k.active ? 'Disable' : 'Enable'}</Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => setDeletingKey(k)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={5} className="h-24 text-center text-gray-500">No API keys yet. Create one for MHMS.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* ------------------------------ ENDPOINT DOCS ------------------------------ */}
        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. MHMS → PowerHub command API</CardTitle>
              <CardDescription>Front office sends room power commands with an API key (create one in the API Keys tab).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <CodeBlock>{`POST ${baseUrl}/integration/power/commands
Header:  X-API-Key: phk_xxxxxxxx...
Body (JSON):
{
  "roomNo": "101",
  "state": "on",                     // "on" | "off"
  "process": "Checkin",              // process master name or id
  "controlTypes": ["Light", "AC"],   // optional — omit for ALL room controls
  "grcNo": "GRC1234",                // optional
  "billNo": "B5678",                 // optional (checkout)
  "guestName": "Mr Kumar",           // optional
  "username": "frontoffice1"         // optional
}`}</CodeBlock>
              <p className="text-xs text-gray-500">
                The command is queued in the PowerLog table with flag = 0. The relay box picks it up on its next poll and acks it, flipping flag to 1.
                If the process has Auto Cutoff enabled in the Process master, the countdown starts immediately and power is cut off automatically when it expires.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Relay box poll &amp; ack (firmware)</CardTitle>
              <CardDescription>The motherboard polls for pending commands and confirms with the random number. Plain HTTP, matching the legacy firmware.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <CodeBlock>{`# Poll (also acts as heartbeat). Response: DEVICE+*0X0F+$0X00#1234+  or  NOCMD
GET ${baseUrl}/PowerDeviceApi/<device-code>

# Ack after applying the bitmasks. Response: OK
GET ${baseUrl}/PowerDeviceStatusApi/<device-code>/<random-no>`}</CodeBlock>
              <p className="text-xs text-gray-500">
                Device provisioning: connect to the box hotspot (mgennpowerconfig), then enter the hotel WiFi SSID/password, port,
                5-digit device code and this server's IP as Host.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------ COMMAND QUEUE ------------------------------ */}
        <TabsContent value="logs" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Latest 100 commands — refreshes every 10 s.</p>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()} disabled={logsFetching}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${logsFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
          </div>
          <div className="rounded-md border bg-white shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Cmd</TableHead>
                  <TableHead>Process</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Guest / Bill</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs?.length ? logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-gray-500">{l.id}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(l.rdate).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{l.deviceCode}</TableCell>
                    <TableCell>{l.roomNo ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {l.state === 1 ? <span className="text-green-700">ON</span> : <span className="text-red-600">OFF</span>}{' '}
                      {l.controlPush}+{l.controlPull}
                    </TableCell>
                    <TableCell className="text-xs">{l.processName ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{l.source}</Badge></TableCell>
                    <TableCell className="text-xs">{[l.guestName, l.billNo ?? l.grcNo].filter(Boolean).join(' / ') || '—'}</TableCell>
                    <TableCell>
                      {l.flag === 1
                        ? <Badge variant="outline" className="bg-green-50 text-green-700">Delivered</Badge>
                        : l.flag === 2
                          ? <Badge variant="outline" className="bg-gray-100 text-gray-400">Superseded</Badge>
                          : <Badge variant="outline" className="bg-amber-50 text-amber-700">Pending</Badge>}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={9} className="h-24 text-center text-gray-500">No commands yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create key dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) setCreatedKey(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{createdKey ? 'API key created' : 'New API Key'}</DialogTitle>
            {createdKey && (
              <DialogDescription className="text-amber-600">
                Copy this key now — it will never be shown again.
              </DialogDescription>
            )}
          </DialogHeader>
          {createdKey ? (
            <CodeBlock>{createdKey}</CodeBlock>
          ) : (
            <div className="space-y-2 py-2">
              <Label htmlFor="keyname">Name</Label>
              <Input id="keyname" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g. MHMS Front Office" />
            </div>
          )}
          <DialogFooter>
            {createdKey ? (
              <Button onClick={() => { setIsCreateOpen(false); setCreatedKey(null); }}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending || !newKeyName.trim()}>
                  {createMutation.isPending ? 'Creating…' : 'Create'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingKey} onOpenChange={(o) => !o && setDeletingKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API key?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletingKey?.name}" will stop working immediately. MHMS calls using it will be rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!regeneratingKey} onOpenChange={(o) => !o && setRegeneratingKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API key?</AlertDialogTitle>
            <AlertDialogDescription>
              A new key will be issued for "{regeneratingKey?.name}". The old key stops working immediately — you'll need to update it in MHMS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
              {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!regeneratedKey} onOpenChange={(o) => !o && setRegeneratedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API key ready</DialogTitle>
            <DialogDescription className="text-amber-600">
              Copy this key now — it will never be shown again.
            </DialogDescription>
          </DialogHeader>
          {regeneratedKey && <CodeBlock>{regeneratedKey}</CodeBlock>}
          <DialogFooter>
            <Button onClick={() => setRegeneratedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
