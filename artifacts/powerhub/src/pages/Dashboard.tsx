import { useGetDashboardSummary, useGetDashboardTrends } from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Building, 
  DoorOpen, 
  Cpu, 
  Wifi, 
  WifiOff,
  Activity,
  Timer,
  RefreshCw,
  TrendingUp,
  Zap,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, AreaChart, Area
} from 'recharts';
import { cn } from '@/lib/utils';

export function Dashboard() {
  const { selectedPropertyId, selectedProperty } = useProperty();
  
  const { data: summary, isLoading: isLoadingSummary, error, refetch, isRefetching } = useGetDashboardSummary(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: ['getDashboardSummary', selectedPropertyId] } }
  );

  const { data: trends, isLoading: isLoadingTrends, refetch: refetchTrends } = useGetDashboardTrends(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: ['getDashboardTrends', selectedPropertyId] } }
  );

  if (!selectedPropertyId) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6">
            <Building className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">No Property Selected</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Please select or create a property from the sidebar to view your power intelligence dashboard.</p>
        </div>
      </div>
    );
  }

  if (isLoadingSummary || isLoadingTrends) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500">Loading intelligence for {selectedProperty?.name}...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse bg-gray-50/50 dark:bg-gray-800/50 border-transparent">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-24 rounded-md bg-gray-200 dark:bg-gray-700"></div>
                <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 rounded-md bg-gray-200 dark:bg-gray-700 mt-2"></div>
                <div className="h-3 w-32 rounded-md bg-gray-200 dark:bg-gray-700 mt-3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="rounded-xl bg-destructive/10 p-6 border border-destructive/20 flex items-start gap-4">
        <div className="rounded-full bg-destructive/20 p-2">
          <Activity className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-destructive">Error loading dashboard</h3>
          <p className="mt-1 text-destructive/80">Failed to retrieve intelligence data for this property. Please try again.</p>
          <button onClick={() => refetch()} className="mt-4 text-sm font-medium text-destructive hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  const renderTrendIndicator = (current: number, previous: number, inverse = false) => {
    if (!previous || previous === 0) return null;
    const pct = ((current - previous) / previous) * 100;
    if (pct === 0) return <span className="text-gray-400 text-xs font-medium ml-2">No change</span>;
    
    // For energy (kwh), lower is better (green), higher is worse (red) if inverse=true
    // For rooms used, higher is better (green), lower is worse (red)
    const isPositive = inverse ? pct <= 0 : pct > 0;
    
    return (
      <span className={cn("inline-flex items-center text-xs font-bold ml-2", isPositive ? "text-success" : "text-destructive")}>
        {pct > 0 ? <ArrowUpRight className="mr-0.5 h-3 w-3" /> : <ArrowDownRight className="mr-0.5 h-3 w-3" />}
        {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">Overview</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Live status and intelligence for <span className="font-semibold text-primary">{selectedProperty?.name}</span></p>
        </div>
        <button
          type="button"
          onClick={() => { refetch(); refetchTrends(); }}
          disabled={isRefetching}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-all hover-elevate"
        >
          <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
          {isRefetching ? 'Syncing...' : 'Refresh Data'}
        </button>
      </div>

      {/* Live Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Rooms</CardTitle>
            <div className="rounded-full bg-primary/10 p-2">
              <DoorOpen className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{summary.rooms}</div>
            <p className="text-xs font-medium text-gray-500 mt-2">Across {summary.blocks} blocks, {summary.floors} floors</p>
          </CardContent>
        </Card>
        
        <Card className={cn("border-l-4 shadow-sm hover:shadow-md transition-all", summary.devicesOffline > 0 ? "border-l-warning" : "border-l-success")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Relay Devices</CardTitle>
            <div className={cn("rounded-full p-2", summary.devicesOffline > 0 ? "bg-warning/10" : "bg-success/10")}>
              <Cpu className={cn("h-4 w-4", summary.devicesOffline > 0 ? "text-warning" : "text-success")} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{summary.devices}</div>
            <div className="flex items-center gap-3 mt-2">
              <span className="inline-flex items-center text-xs font-bold text-success">
                <span className="mr-1.5 h-2 w-2 rounded-full bg-success"></span>
                {summary.devicesOnline} online
              </span>
              {summary.devicesOffline > 0 && (
                <span className="inline-flex items-center text-xs font-bold text-warning">
                  <span className="mr-1.5 h-2 w-2 rounded-full bg-warning animate-pulse"></span>
                  {summary.devicesOffline} offline
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-chart-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-chart-5/5 rounded-bl-full -mr-4 -mt-4 pointer-events-none"></div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Loads</CardTitle>
            <div className="rounded-full bg-chart-5/10 p-2">
              <Zap className="h-4 w-4 text-chart-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              {summary.controlsOn}
            </div>
            <p className="text-xs font-medium text-gray-500 mt-2">Out of {summary.controls} configured channels</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-chart-2 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Profiles</CardTitle>
            <div className="rounded-full bg-chart-2/10 p-2">
              <Timer className="h-4 w-4 text-chart-2" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{summary.processTypes}</div>
            <p className="text-xs font-medium text-gray-500 mt-2">Auto-cutoff workflows</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Trends Insight */}
      {trends && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Weekly Insights</h2>
            <span className="text-sm font-medium text-gray-500 ml-2">Last 7 days vs Previous</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Energy Consumption Chart */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold text-gray-800 dark:text-gray-100 flex items-center justify-between">
                  Power Consumption (kWh)
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                    {trends.current.kwh.toFixed(1)} kWh Total
                    {renderTrendIndicator(trends.current.kwh, trends.previous.kwh, true)}
                  </Badge>
                </CardTitle>
                <CardDescription>Daily energy usage compared to last week</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trends.days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorKwh" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPrevKwh" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} dy={10} />
                      <YAxis tickLine={false} axisLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))', boxShadow: 'var(--shadow-md)' }}
                        itemStyle={{ fontWeight: 600 }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Area type="monotone" name="This Week" dataKey="kwh" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorKwh)" />
                      <Area type="monotone" name="Last Week" dataKey="prevKwh" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorPrevKwh)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Room Usage Chart */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold text-gray-800 dark:text-gray-100 flex items-center justify-between">
                  Room Activity
                  <Badge variant="outline" className="bg-chart-2/5 text-chart-2 border-chart-2/20">
                    {trends.current.roomsUsed} Rooms Used
                    {renderTrendIndicator(trends.current.roomsUsed, trends.previous.roomsUsed, false)}
                  </Badge>
                </CardTitle>
                <CardDescription>Unique rooms active per day</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trends.days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} dy={10} />
                      <YAxis tickLine={false} axisLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                      <RechartsTooltip 
                        cursor={{fill: 'hsl(var(--muted)/0.4)'}}
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))', boxShadow: 'var(--shadow-md)' }}
                        itemStyle={{ fontWeight: 600 }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Bar name="This Week" dataKey="roomsUsed" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar name="Last Week" dataKey="prevRoomsUsed" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      
      {/* Device Health Table */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Device Health</h2>
        
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="px-5 py-4 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-5 py-4 font-semibold text-gray-600 dark:text-gray-300">Device Code</th>
                  <th className="px-5 py-4 font-semibold text-gray-600 dark:text-gray-300">Box IP (current)</th>
                  <th className="px-5 py-4 font-semibold text-gray-600 dark:text-gray-300">Previous IP</th>
                  <th className="px-5 py-4 font-semibold text-gray-600 dark:text-gray-300">Setup IP</th>
                  <th className="px-5 py-4 font-semibold text-gray-600 dark:text-gray-300">Location</th>
                  <th className="px-5 py-4 font-semibold text-gray-600 dark:text-gray-300">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {summary.devicesList && summary.devicesList.length > 0 ? (
                  summary.devicesList.map((device) => (
                    <tr key={device.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        {device.online ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20 font-bold">
                            <Wifi className="mr-1.5 h-3.5 w-3.5" /> Online
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 font-bold">
                            <WifiOff className="mr-1.5 h-3.5 w-3.5" /> Offline
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-gray-900 dark:text-white">{device.code}</td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 font-mono text-xs">{device.reportedIp || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 font-mono text-xs">{device.previousReportedIp || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 font-mono text-xs">{device.setupIp || '—'}</td>
                      <td className="px-5 py-3.5 font-medium text-gray-700 dark:text-gray-300">{device.floorName || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">
                        {device.lastSeenAt ? formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true }) : 'Never'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <Cpu className="h-10 w-10 text-gray-300 mb-3" />
                        <p className="font-medium text-gray-900 dark:text-white">No devices configured</p>
                        <p className="text-sm mt-1">Connect your relay boxes to see them here.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
