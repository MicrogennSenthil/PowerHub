import { CurrentUser } from '@workspace/api-client-react';
import { useProperty } from '@/contexts/PropertyContext';
import { useClerk } from '@clerk/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LogOut, Building, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function Topbar({ me }: { me: CurrentUser }) {
  const { selectedPropertyId, setSelectedPropertyId } = useProperty();
  const { signOut } = useClerk();

  const handleSignOut = () => {
    signOut({ redirectUrl: '/' });
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-4 md:px-6">
      <div className="flex flex-1 items-center gap-4">
        {/* Property Selector */}
        {me.properties && me.properties.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building className="h-4 w-4" />
            </div>
            <Select 
              value={selectedPropertyId?.toString() || ''} 
              onValueChange={(val) => setSelectedPropertyId(parseInt(val, 10))}
            >
              <SelectTrigger className="w-[240px] border-none bg-transparent shadow-none hover:bg-gray-50 focus:ring-0 focus:ring-offset-0 font-medium">
                <SelectValue placeholder="Select property" />
              </SelectTrigger>
              <SelectContent>
                {me.properties.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
            <Building className="h-4 w-4" />
            No properties allocated
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {me.isSuperAdmin && (
          <div className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Super Admin
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {getInitials(me.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{me.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{me.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:bg-destructive/5 focus:text-destructive cursor-pointer" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
