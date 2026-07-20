import { useMemo, useState } from 'react';
import {
  useGetPowerUsageReport,
  getGetPowerUsageReportQueryKey,
  useListRooms,
  getListRoomsQueryKey,
} from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, FileSpreadsheet, Printer, Mail, MessageCircle, Zap, Clock, IndianRupee, ListChecks } from 'lucide-react';

function todayISO(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function PowerUsageReport() {
  const { selectedPropertyId } = useProperty();

  const [from, setFrom] = useState(todayISO(7));
  const [to, setTo] = useState(todayISO(0));
  const [roomId, setRoomId] = useState<string>('all');
  const [guest, setGuest] = useState('');
  const [billNo, setBillNo] = useState('');
  const [grcNo, setGrcNo] = useState('');
  const [username, setUsername] = useState('');

  const params = useMemo(() => ({
    propertyId: selectedPropertyId!,
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59`).toISOString(),
    ...(roomId !== 'all' ? { roomId: Number(roomId) } : {}),
    ...(guest ? { guest } : {}),
    ...(billNo ? { billNo } : {}),
    ...(grcNo ? { grcNo } : {}),
    ...(username ? { username } : {}),
  }), [selectedPropertyId, from, to, roomId, guest, billNo, grcNo, username]);

  const { data: report, isLoading, isFetching } = useGetPowerUsageReport(params, {
    query: { enabled: !!selectedPropertyId, queryKey: getGetPowerUsageReportQueryKey(params) },
  });
  const { data: rooms } = useListRooms(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListRoomsQueryKey({ propertyId: selectedPropertyId! }) } },
  );

  const currencySymbol = report?.currency === 'INR' ? '₹' : (report?.currency ?? '');

  const exportCsv = () => {
    if (!report) return;
    const headers = ['Room', 'Block', 'Control', 'Type', 'Process', 'GRC No', 'Bill No', 'Guest', 'User', 'Started', 'Ended', 'End Reason', 'Wattage (W)', 'Hours', 'kWh', `Cost (${report.currency})`];
    const rows = report.sessions.map((s) => [
      s.roomNo ?? '', s.blockName ?? '', s.controlLabel ?? '', s.controlTypeName ?? '', s.processName ?? '',
      s.grcNo ?? '', s.billNo ?? '', s.guestName ?? '', s.requestedBy ?? '',
      new Date(s.startedAt).toLocaleString(), s.endedAt ? new Date(s.endedAt).toLocaleString() : 'RUNNING',
      s.endReason ?? '', s.wattage ?? '', s.hours, s.kwh, s.cost,
    ]);
    rows.push([]);
    rows.push(['TOTALS', '', '', '', '', '', '', '', '', '', '', '', '', report.totals.hours, report.totals.kwh, report.totals.cost]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `power-usage-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const summaryText = report
    ? `Power Usage Report (${from} to ${to})\nSessions: ${report.totals.sessions}\nTotal hours: ${report.totals.hours}\nConsumption: ${report.totals.kwh} kWh\nCost: ${currencySymbol}${report.totals.cost}`
    : '';

  if (!selectedPropertyId) return <div className="p-8 text-center text-gray-500">Please select a property first.</div>;

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Power Usage Report</h1>
          <p className="text-sm text-gray-500">Room-wise power sessions with hours, consumption and cost.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!report?.sessions.length}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />Excel
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!report?.sessions.length}>
            <Printer className="mr-1.5 h-4 w-4" />PDF / Print
          </Button>
          <Button variant="outline" disabled={!report?.sessions.length}
            onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent('Power Usage Report')}&body=${encodeURIComponent(summaryText)}`; }}>
            <Mail className="mr-1.5 h-4 w-4" />Mail
          </Button>
          <Button variant="outline" disabled={!report?.sessions.length}
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, '_blank')}>
            <MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="grid grid-cols-2 gap-3 pt-6 md:grid-cols-4 lg:grid-cols-7">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Room</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rooms</SelectItem>
                {rooms?.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.roomNo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Guest name</Label>
            <Input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Search…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bill No</Label>
            <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">GRC No</Label>
            <Input value={grcNo} onChange={(e) => setGrcNo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">User</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      {report && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { icon: ListChecks, label: 'Sessions', value: String(report.totals.sessions) },
            { icon: Clock, label: 'Total hours', value: `${report.totals.hours} h` },
            { icon: Zap, label: 'Consumption', value: `${report.totals.kwh} kWh` },
            { icon: IndianRupee, label: `Cost @ ${currencySymbol}${report.tariffPerKwh}/kWh`, value: `${currencySymbol}${report.totals.cost}` },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="rounded-md bg-primary/10 p-2"><Icon className="h-5 w-5 text-primary" /></div>
                <div>
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-lg font-bold">{value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Sessions table */}
      <div className="rounded-md border bg-white shadow-sm overflow-x-auto">
        {isLoading || isFetching ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Control</TableHead>
                <TableHead>Process</TableHead>
                <TableHead>GRC / Bill</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ended</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">kWh</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report?.sessions.length ? report.sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.roomNo ?? '—'}{s.blockName ? <span className="ml-1 text-xs text-gray-400">({s.blockName})</span> : null}</TableCell>
                  <TableCell className="text-sm">{s.controlLabel || s.controlTypeName || `#${s.controlId}`}{s.controlTypeName && s.controlLabel ? <span className="ml-1 text-xs text-gray-400">{s.controlTypeName}</span> : null}</TableCell>
                  <TableCell className="text-sm">{s.processName ?? '—'}</TableCell>
                  <TableCell className="text-xs">{[s.grcNo, s.billNo].filter(Boolean).join(' / ') || '—'}</TableCell>
                  <TableCell className="text-sm">{s.guestName ?? '—'}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(s.startedAt).toLocaleString()}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {s.endedAt
                      ? <>{new Date(s.endedAt).toLocaleString()}{s.endReason === 'auto-cutoff' && <Badge variant="outline" className="ml-1 bg-blue-50 text-blue-700 text-[10px]">auto</Badge>}</>
                      : <Badge variant="outline" className="bg-green-50 text-green-700">RUNNING</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{s.hours}</TableCell>
                  <TableCell className="text-right">{s.kwh}</TableCell>
                  <TableCell className="text-right">{currencySymbol}{s.cost}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={10} className="h-24 text-center text-gray-500">No power sessions in this range.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
