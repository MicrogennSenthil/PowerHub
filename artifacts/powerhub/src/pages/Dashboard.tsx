import { useGetDashboardSummary } from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Building, 
  DoorOpen, 
  Cpu, 
  Settings2, 
  Wifi, 
  WifiOff,
  Activity,
  Layers,
  BoxSelect,
  Timer
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function Dashboard() {
  const { selectedPropertyId, selectedProperty } = useProperty();
  
  const { data: summary, isLoading, error } = useGetDashboardSummary(
    { propertyId: selectedPropertyId! },
    { query: { enabled: !!selectedPropertyId, queryKey: ['getDashboardSummary', selectedPropertyId] } }
  );

  if (!selectedPropertyId) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center">
          <Building className="mx-auto h-12 w-12 text-gray-300" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No Property Selected</h2>
          <p className="mt-2 text-sm text-gray-500">Please select or create a property to view the dashboard.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Loading overview for {selectedProperty?.name}...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Card key={i} className="animate-pulse bg-gray-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-24 rounded bg-gray-200"></div>
                <div className="h-4 w-4 rounded bg-gray-200"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 w-12 rounded bg-gray-200"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="rounded-lg bg-red-50 p-4 border border-red-200">
        <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
        <p className="mt-1 text-sm text-red-600">Failed to retrieve data for this property.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Overview and live status for {selectedProperty?.name}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rooms</CardTitle>
            <DoorOpen className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.rooms}</div>
            <p className="text-xs text-gray-500 mt-1">Across {summary.blocks} blocks, {summary.floors} floors</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Relay Devices</CardTitle>
            <Cpu className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.devices}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-green-600 font-medium">{summary.devicesOnline} online</span>
              <span className="text-xs text-red-600 font-medium">{summary.devicesOffline} offline</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Loads</CardTitle>
            <Activity className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.controlsOn}</div>
            <p className="text-xs text-gray-500 mt-1">Out of {summary.controls} configured channels</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Process Workflows</CardTitle>
            <Timer className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.processTypes}</div>
            <p className="text-xs text-gray-500 mt-1">Active auto-cutoff profiles</p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-bold tracking-tight text-gray-900 mt-8">Device Health</h2>
      
      <div className="rounded-md border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Device Code</th>
                <th className="px-4 py-3 font-medium text-gray-500">IP Address</th>
                <th className="px-4 py-3 font-medium text-gray-500">Location</th>
                <th className="px-4 py-3 font-medium text-gray-500">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {summary.devicesList && summary.devicesList.length > 0 ? (
                summary.devicesList.map((device) => (
                  <tr key={device.id} className="border-b last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      {device.online ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <Wifi className="mr-1 h-3 w-3" /> Online
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          <WifiOff className="mr-1 h-3 w-3" /> Offline
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{device.code}</td>
                    <td className="px-4 py-3 text-gray-500">{device.ipAddress || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{device.floorName || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {device.lastSeenAt ? formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true }) : 'Never'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No devices configured for this property yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
