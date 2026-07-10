import { Link, useLocation } from 'wouter';
import { CurrentUser } from '@workspace/api-client-react';
import { 
  LayoutDashboard, 
  Building, 
  BoxSelect, 
  Layers, 
  DoorOpen, 
  Bed, 
  Settings2, 
  Cpu, 
  Timer, 
  Users, 
  ShieldAlert,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarProps {
  me: CurrentUser;
}

export function Sidebar({ me }: SidebarProps) {
  const [location] = useLocation();

  const hasPerm = (perm: string) => me.isSuperAdmin || me.permissions.includes(perm);

  const navGroups = [
    {
      title: "Dashboard",
      items: [
        { title: "Overview", href: "/dashboard", icon: LayoutDashboard, show: true },
      ]
    },
    {
      title: "Facility",
      items: [
        { title: "Properties", href: "/properties", icon: Building, show: me.isSuperAdmin }, // super admin only as per spec
        { title: "Blocks", href: "/blocks", icon: BoxSelect, show: hasPerm('blocks.view') },
        { title: "Floors", href: "/floors", icon: Layers, show: hasPerm('floors.view') },
        { title: "Room Types", href: "/room-types", icon: Bed, show: hasPerm('room_types.view') },
        { title: "Rooms", href: "/rooms", icon: DoorOpen, show: hasPerm('rooms.view') },
      ]
    },
    {
      title: "Automation",
      items: [
        { title: "Control Types", href: "/control-types", icon: Settings2, show: hasPerm('control_types.view') },
        { title: "Process Types", href: "/process-types", icon: Timer, show: hasPerm('process_types.view') },
        { title: "Devices", href: "/devices", icon: Cpu, show: hasPerm('devices.view') },
      ]
    },
    {
      title: "System",
      items: [
        { title: "Users", href: "/users", icon: Users, show: hasPerm('users.view') || hasPerm('users.manage') }, // User requested users.manage only for users, but viewing users needs view
        { title: "Roles", href: "/roles", icon: ShieldAlert, show: hasPerm('roles.view') || hasPerm('roles.manage') },
      ]
    }
  ];

  return (
    <div className="flex w-64 flex-col border-r bg-white">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" stroke="none" />
        </svg>
        <span className="text-lg font-bold tracking-tight text-gray-900">PowerHub</span>
      </div>
      
      <ScrollArea className="flex-1 py-4">
        <nav className="flex flex-col gap-6 px-4">
          {navGroups.map((group, i) => {
            const visibleItems = group.items.filter(item => item.show);
            if (visibleItems.length === 0) return null;
            
            return (
              <div key={i} className="flex flex-col gap-1">
                <span className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {group.title}
                </span>
                {visibleItems.map((item) => {
                  const isActive = location === item.href || location.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive 
                          ? "bg-primary/10 text-primary" 
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-gray-400")} />
                      {item.title}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}
