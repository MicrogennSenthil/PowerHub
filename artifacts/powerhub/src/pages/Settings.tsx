import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Radio, Wifi, Save, ShieldCheck, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProtocolKind = 'legacy' | 'mqtt';

interface FormState {
  deviceProtocol: ProtocolKind;
  offlineThresholdMinutes: string;
  pollIntervalSeconds: string;
  mqttBrokerUrl: string;
  mqttPort: string;
  mqttUsername: string;
  mqttPassword: string;
  mqttBaseTopic: string;
  mqttUseTls: boolean;
  propertyCodeMode: 'manual' | 'auto';
  propertyCodePrefix: string;
}

const EMPTY: FormState = {
  deviceProtocol: 'legacy',
  offlineThresholdMinutes: '2',
  pollIntervalSeconds: '10',
  mqttBrokerUrl: '',
  mqttPort: '1883',
  mqttUsername: '',
  mqttPassword: '',
  mqttBaseTopic: 'powerhub',
  mqttUseTls: false,
  propertyCodeMode: 'manual',
  propertyCodePrefix: 'PROP',
};

export function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const updateMutation = useUpdateSettings();

  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!settings) return;
    setForm({
      deviceProtocol: (settings.deviceProtocol as ProtocolKind) ?? 'legacy',
      offlineThresholdMinutes: String(settings.offlineThresholdMinutes ?? 2),
      pollIntervalSeconds: String(settings.pollIntervalSeconds ?? 10),
      mqttBrokerUrl: settings.mqttBrokerUrl ?? '',
      mqttPort: settings.mqttPort != null ? String(settings.mqttPort) : '1883',
      mqttUsername: settings.mqttUsername ?? '',
      // The password is never returned by the API; leave it blank and only
      // send a new value when the admin actually types one.
      mqttPassword: '',
      mqttBaseTopic: settings.mqttBaseTopic ?? 'powerhub',
      mqttUseTls: settings.mqttUseTls ?? false,
      propertyCodeMode:
        (settings.propertyCodeMode as 'manual' | 'auto') ?? 'manual',
      propertyCodePrefix: settings.propertyCodePrefix ?? 'PROP',
    });
  }, [settings]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    const offline = parseInt(form.offlineThresholdMinutes, 10);
    const poll = parseInt(form.pollIntervalSeconds, 10);
    if (!Number.isFinite(offline) || offline < 1) {
      toast({ title: 'Validation Error', description: 'Offline threshold must be at least 1 minute.', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(poll) || poll < 1) {
      toast({ title: 'Validation Error', description: 'Poll interval must be at least 1 second.', variant: 'destructive' });
      return;
    }
    if (form.deviceProtocol === 'mqtt' && !form.mqttBrokerUrl.trim()) {
      toast({ title: 'Validation Error', description: 'MQTT broker URL is required when MQTT is the active protocol.', variant: 'destructive' });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        data: {
          deviceProtocol: form.deviceProtocol,
          offlineThresholdMinutes: offline,
          pollIntervalSeconds: poll,
          mqttBrokerUrl: form.mqttBrokerUrl.trim() || null,
          mqttPort: form.mqttPort.trim() ? parseInt(form.mqttPort, 10) : null,
          mqttUsername: form.mqttUsername.trim() || null,
          // Only include the password when changed; blank means "keep existing".
          ...(form.mqttPassword ? { mqttPassword: form.mqttPassword } : {}),
          mqttBaseTopic: form.mqttBaseTopic.trim() || null,
          mqttUseTls: form.mqttUseTls,
          propertyCodeMode: form.propertyCodeMode,
          propertyCodePrefix: form.propertyCodePrefix.trim() || 'PROP',
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: 'Settings saved', description: 'Software setup updated successfully.' });
    } catch (err: any) {
      toast({ title: 'Error saving settings', description: err?.message ?? 'Something went wrong', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const mqttActive = form.deviceProtocol === 'mqtt';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Software Setup</h1>
        <p className="text-sm text-gray-500">
          Configure how PowerHub communicates with the relay devices in the field.
        </p>
      </div>

      {/* Protocol selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Device Communication Protocol</CardTitle>
          <CardDescription>
            The active protocol determines how the server exchanges commands with devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={form.deviceProtocol}
            onValueChange={(v) => set('deviceProtocol', v as ProtocolKind)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label
              htmlFor="proto-legacy"
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors',
                !mqttActive ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <RadioGroupItem value="legacy" id="proto-legacy" className="mt-1" />
              <div>
                <div className="flex items-center gap-2 font-medium text-gray-900">
                  <Wifi className="h-4 w-4" /> Legacy HTTP-Poll
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Devices poll the server for commands and acknowledge them. Works with existing firmware. Active in this phase.
                </p>
              </div>
            </label>

            <label
              htmlFor="proto-mqtt"
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors',
                mqttActive ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <RadioGroupItem value="mqtt" id="proto-mqtt" className="mt-1" />
              <div>
                <div className="flex items-center gap-2 font-medium text-gray-900">
                  <Radio className="h-4 w-4" /> MQTT
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Real-time push over a broker. Requires new firmware — enable once the MQTT device layer is built.
                </p>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Legacy settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wifi className="h-4 w-4" /> HTTP-Poll Settings</CardTitle>
          <CardDescription>Applies to the legacy protocol and the device online/offline detection.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="offline">Offline Threshold (minutes)</Label>
            <Input id="offline" type="number" min={1} value={form.offlineThresholdMinutes}
              onChange={(e) => set('offlineThresholdMinutes', e.target.value)} />
            <p className="text-xs text-gray-500">A device is marked offline if not seen within this window.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="poll">Poll Interval (seconds)</Label>
            <Input id="poll" type="number" min={1} value={form.pollIntervalSeconds}
              onChange={(e) => set('pollIntervalSeconds', e.target.value)} />
            <p className="text-xs text-gray-500">Suggested interval devices use when polling for commands.</p>
          </div>
        </CardContent>
      </Card>

      {/* MQTT settings */}
      <Card className={cn(!mqttActive && 'opacity-70')}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Radio className="h-4 w-4" /> MQTT Broker Settings</CardTitle>
          <CardDescription>
            {mqttActive
              ? 'These credentials will be used to connect to your MQTT broker.'
              : 'Pre-configure the broker now so you can switch to MQTT later without downtime.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="broker">Broker URL / Host</Label>
            <Input id="broker" placeholder="mqtt.example.com or 10.0.0.5" value={form.mqttBrokerUrl}
              onChange={(e) => set('mqttBrokerUrl', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input id="port" type="number" placeholder="1883" value={form.mqttPort}
              onChange={(e) => set('mqttPort', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic">Base Topic</Label>
            <Input id="topic" placeholder="powerhub" value={form.mqttBaseTopic}
              onChange={(e) => set('mqttBaseTopic', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user">Username</Label>
            <Input id="user" value={form.mqttUsername} autoComplete="off"
              onChange={(e) => set('mqttUsername', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pass">Password</Label>
            <Input id="pass" type="password" value={form.mqttPassword} autoComplete="new-password"
              placeholder={settings?.mqttPasswordSet ? '•••••••• (unchanged)' : ''}
              onChange={(e) => set('mqttPassword', e.target.value)} />
            {settings?.mqttPasswordSet && (
              <p className="text-xs text-gray-500">A password is saved. Leave blank to keep it.</p>
            )}
          </div>
          <div className="flex items-center gap-3 sm:col-span-2 pt-1">
            <Switch id="tls" checked={form.mqttUseTls} onCheckedChange={(c) => set('mqttUseTls', c)} />
            <div>
              <Label htmlFor="tls" className="flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Use TLS</Label>
              <p className="text-xs text-gray-500">Encrypt the connection to the broker (recommended for public brokers).</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Property code generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Hash className="h-4 w-4" /> Property Code</CardTitle>
          <CardDescription>
            Choose how the code for each property is assigned when a new property is created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={form.propertyCodeMode}
            onValueChange={(v) => set('propertyCodeMode', v as 'manual' | 'auto')}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label
              htmlFor="code-manual"
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors',
                form.propertyCodeMode === 'manual' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <RadioGroupItem value="manual" id="code-manual" className="mt-1" />
              <div>
                <div className="font-medium text-gray-900">Manual</div>
                <p className="mt-1 text-xs text-gray-500">
                  The admin types a unique code for each property. Duplicates are rejected.
                </p>
              </div>
            </label>

            <label
              htmlFor="code-auto"
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors',
                form.propertyCodeMode === 'auto' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <RadioGroupItem value="auto" id="code-auto" className="mt-1" />
              <div>
                <div className="font-medium text-gray-900">Auto-generate</div>
                <p className="mt-1 text-xs text-gray-500">
                  Codes are generated automatically as <span className="font-mono">{(form.propertyCodePrefix.trim() || 'PROP')}-001</span>, incrementing per property.
                </p>
              </div>
            </label>
          </RadioGroup>

          {form.propertyCodeMode === 'auto' && (
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="code-prefix">Code Prefix</Label>
              <Input
                id="code-prefix"
                value={form.propertyCodePrefix}
                onChange={(e) => set('propertyCodePrefix', e.target.value)}
                placeholder="PROP"
              />
              <p className="text-xs text-gray-500">Used as the prefix for auto-generated codes.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
