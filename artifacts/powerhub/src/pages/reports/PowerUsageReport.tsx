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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, FileSpreadsheet, Printer, Mail, MessageCircle, Zap, Clock, IndianRupee, ListChecks, Filter, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

function todayISO(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function PowerUsageReport() {
  const { selectedPropertyId, selectedProperty } = useProperty();

  const [from, setFrom] = useState(todayISO(7));
  const [to, setTo] = useState(todayISO(0));
  const [roomId, setRoomId] = useState<string>('all');
  const [guest, setGuest] = useState('');
  const [billNo, setBillNo] = useState('');
  const [grcNo, setGrcNo] = useState('');
  const [username, setUsername] = useState('');
  const [source, setSource] = useState<string>('all');

  const params = useMemo(() => ({
    propertyId: selectedPropertyId!,
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59`).toISOString(),
    ...(roomId !== 'all' ? { roomId: Number(roomId) } : {}),
    ...(guest ? { guest } : {}),
    ...(billNo ? { billNo } : {}),
    ...(grcNo ? { grcNo } : {}),
    ...(username ? { username } : {}),
    ...(source !== 'all' ? { source } : {}),
  }), [selectedPropertyId, from, to, roomId, guest, billNo, grcNo, username, source]);

  const { data: report, isLoading, isFetching } = useGetPowerUsageReport(params, {
    query: { enabled: !!selectedPropertyId, queryKey: getGetPowerUsageReportQueryKey(params) },
  });
  const { data: rooms } = useListRooms(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: getListRoomsQueryKey({ propertyId: selectedPropertyId! }) } },
  );

  const CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ' };
  const currencySymbol = report?.currency ? (CURRENCY_SYMBOLS[report.currency] ?? report.currency + ' ') : '';

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

  if (!selectedPropertyId) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6">
            <Zap className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Select Property</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Please select a property to view its power usage intelligence and reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500 print:space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 print:hidden border-b border-gray-200 dark:border-gray-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white flex items-center gap-3">
            Power Analytics
          </h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2">
            Detailed consumption & cost analysis for <span className="text-primary font-bold">{selectedProperty?.name}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="font-semibold shadow-sm hover-elevate border-gray-200" onClick={exportCsv} disabled={!report?.sessions.length || isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" /> : <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />}
            Export Excel
          </Button>
          <Button variant="outline" className="font-semibold shadow-sm hover-elevate border-gray-200" onClick={() => window.print()} disabled={!report?.sessions.length}>
            <Printer className="mr-2 h-4 w-4 text-blue-600" />
            Print PDF
          </Button>
          <Button variant="outline" className="font-semibold shadow-sm hover-elevate border-gray-200" disabled={!report?.sessions.length}
            onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent('Power Usage Report')}&body=${encodeURIComponent(summaryText)}`; }}>
            <Mail className="mr-2 h-4 w-4 text-gray-600" />
            Email
          </Button>
          <Button variant="outline" className="font-semibold shadow-sm hover-elevate border-gray-200" disabled={!report?.sessions.length}
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, '_blank')}>
            <MessageCircle className="mr-2 h-4 w-4 text-green-500" />
            WhatsApp
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden border-primary/20 shadow-sm bg-white dark:bg-gray-900 overflow-hidden relative">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
        <CardHeader className="py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <CardTitle className="text-sm font-bold flex items-center text-gray-700 dark:text-gray-300">
            <Filter className="mr-2 h-4 w-4 text-primary" />
            Report Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">From Date</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="font-medium bg-gray-50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">To Date</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="font-medium bg-gray-50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">Room Filter</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="font-medium bg-gray-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-medium">All rooms</SelectItem>
                  {rooms?.map((r) => <SelectItem key={r.id} value={String(r.id)} className="font-medium">{r.roomNo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">Guest Name</Label>
              <Input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Search…" className="font-medium bg-gray-50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">Bill No</Label>
              <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="Enter bill..." className="font-medium bg-gray-50 uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">GRC No</Label>
              <Input value={grcNo} onChange={(e) => setGrcNo(e.target.value)} placeholder="Enter GRC..." className="font-medium bg-gray-50 uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">User / Staff</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Search staff..." className="font-medium bg-gray-50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-600">Trigger Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="font-medium bg-gray-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-medium">All sources</SelectItem>
                  <SelectItem value="hms-sync" className="font-medium">HMS Sync</SelectItem>
                  <SelectItem value="mhms" className="font-medium">HMS Auto (MHMS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Totals */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-chart-1 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
            <div className="absolute right-0 top-0 w-20 h-20 bg-chart-1/5 rounded-bl-full pointer-events-none"></div>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-chart-1/10 p-3"><ListChecks className="h-6 w-6 text-chart-1" /></div>
              <div>
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Sessions</div>
                <div className="text-2xl font-extrabold text-gray-900 dark:text-white">{report.totals.sessions}</div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-chart-2 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
            <div className="absolute right-0 top-0 w-20 h-20 bg-chart-2/5 rounded-bl-full pointer-events-none"></div>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-chart-2/10 p-3"><Clock className="h-6 w-6 text-chart-2" /></div>
              <div>
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Hours</div>
                <div className="text-2xl font-extrabold text-gray-900 dark:text-white">{report.totals.hours} <span className="text-sm font-medium text-gray-400">hrs</span></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-all overflow-hidden relative">
            <div className="absolute right-0 top-0 w-20 h-20 bg-primary/5 rounded-bl-full pointer-events-none"></div>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-primary/10 p-3"><Zap className="h-6 w-6 text-primary" /></div>
              <div>
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Consumption</div>
                <div className="text-2xl font-extrabold text-gray-900 dark:text-white">{report.totals.kwh} <span className="text-sm font-medium text-gray-400">kWh</span></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-chart-5 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
            <div className="absolute right-0 top-0 w-20 h-20 bg-chart-5/5 rounded-bl-full pointer-events-none"></div>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-chart-5/10 p-3"><IndianRupee className="h-6 w-6 text-chart-5" /></div>
              <div>
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  Est. Cost <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-gray-100">{currencySymbol}{report.tariffPerKwh}/kWh</Badge>
                </div>
                <div className="text-2xl font-extrabold text-chart-5">{currencySymbol}{report.totals.cost}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sessions Data Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex justify-between items-center">
          <h3 className="font-bold text-gray-800 dark:text-gray-200">Session Log Details</h3>
          {report && report.sessions.length > 0 && (
            <Badge variant="outline" className="font-medium bg-white">
              Showing {report.sessions.length} records
            </Badge>
          )}
        </div>
        
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex h-64 flex-col items-center justify-center space-y-3 text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-medium tracking-wide">Compiling report data...</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50 dark:bg-gray-800/80">
                <TableRow className="hover:bg-transparent border-gray-200 dark:border-gray-700">
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4">Room</TableHead>
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4">Control</TableHead>
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4">Process</TableHead>
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4">GRC / Bill</TableHead>
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4">Guest</TableHead>
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4">Started</TableHead>
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4">Ended</TableHead>
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4 text-right">Hrs</TableHead>
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4 text-right">kWh</TableHead>
                  <TableHead className="font-bold text-gray-600 dark:text-gray-300 py-4 text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {report?.sessions.length ? report.sessions.map((s) => (
                  <TableRow key={s.id} className="hover:bg-primary/5 transition-colors group">
                    <TableCell className="py-3">
                      <div className="font-extrabold text-gray-900 dark:text-white">{s.roomNo ?? '—'}</div>
                      {s.blockName && <div className="text-[10px] uppercase font-bold text-gray-400 mt-0.5">{s.blockName}</div>}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="font-semibold text-gray-800 dark:text-gray-200">{s.controlLabel || s.controlTypeName || `#${s.controlId}`}</div>
                      {s.controlTypeName && s.controlLabel && <div className="text-[10px] uppercase font-bold text-gray-400 mt-0.5">{s.controlTypeName}</div>}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-col gap-1">
                        {s.processName ? (
                          <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold border-gray-200 dark:border-gray-700 w-fit">
                            {s.processName}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        {s.requestedBy === 'HMS Sync' && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] uppercase tracking-wider font-bold w-fit">
                            HMS Sync
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-xs font-mono font-medium text-gray-600 dark:text-gray-400">
                        {[s.grcNo, s.billNo].filter(Boolean).join(' / ') || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">{s.guestName ?? '—'}</div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded inline-block">
                        {new Date(s.startedAt).toLocaleString(undefined, { 
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {s.endedAt ? (
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded inline-block">
                            {new Date(s.endedAt).toLocaleString(undefined, { 
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                            })}
                          </div>
                          {s.endReason === 'auto-cutoff' && (
                            <Badge variant="secondary" className="bg-chart-2/10 text-chart-2 border border-chart-2/20 text-[9px] uppercase tracking-wider font-bold">
                              Auto
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="default" className="bg-success text-success-foreground font-bold shadow-[0_0_8px_hsl(var(--success)/0.5)] animate-pulse">
                          RUNNING
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono text-sm font-medium">{s.hours}</TableCell>
                    <TableCell className="py-3 text-right">
                      <Badge variant="outline" className="font-mono bg-primary/5 text-primary border-primary/20 text-sm">
                        {s.kwh}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <div className="font-mono font-bold text-gray-900 dark:text-white text-sm">
                        {currencySymbol}{s.cost}
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={10} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <ListChecks className="h-10 w-10 mb-3 opacity-20" />
                        <p className="font-medium text-gray-500">No power sessions found in this date range.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
