import { useGetMe } from '@workspace/api-client-react';
import { PropertyProvider } from '@/contexts/PropertyContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Loader2 } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useGetMe();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Authentication Error</h2>
        <p className="mt-2 text-gray-500">Failed to load user profile.</p>
      </div>
    );
  }

  return (
    <PropertyProvider properties={me.properties || []}>
      <div className="flex h-[100dvh] w-full overflow-hidden bg-gray-50">
        <Sidebar me={me} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar me={me} />
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </PropertyProvider>
  );
}
