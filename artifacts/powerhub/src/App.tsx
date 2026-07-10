import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Landing } from '@/pages/Landing';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { Properties } from '@/pages/masters/Properties';
import { Blocks } from '@/pages/masters/Blocks';
import { Floors } from '@/pages/masters/Floors';
import { RoomTypes } from '@/pages/masters/RoomTypes';
import { Rooms } from '@/pages/masters/Rooms';
import { ControlTypes } from '@/pages/masters/ControlTypes';
import { Devices } from '@/pages/masters/Devices';
import { DeviceDetail } from '@/pages/masters/DeviceDetail';
import { ProcessTypes } from '@/pages/masters/ProcessTypes';
import { Users } from '@/pages/masters/Users';
import { Roles } from '@/pages/masters/Roles';
import { Settings } from '@/pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(221.2, 83.2%, 53.3%)",
    colorForeground: "hsl(222.2, 84%, 4.9%)",
    colorMutedForeground: "hsl(215.4, 16.3%, 46.9%)",
    colorDanger: "hsl(0, 84.2%, 60.2%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(214.3, 31.8%, 91.4%)",
    colorInputForeground: "hsl(222.2, 84%, 4.9%)",
    colorNeutral: "hsl(214.3, 31.8%, 91.4%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden border shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold text-gray-900",
    headerSubtitle: "text-sm text-gray-500",
    socialButtonsBlockButtonText: "text-sm font-medium",
    formFieldLabel: "text-sm font-medium text-gray-700",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-sm text-gray-500",
    dividerText: "text-xs text-gray-400 bg-white px-2",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-sm text-green-600",
    alertText: "text-sm text-destructive",
    logoBox: "mb-6 flex justify-center",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "border border-gray-200 hover:bg-gray-50",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    formFieldInput: "border border-gray-200 bg-white text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary",
    footerAction: "mt-6",
    dividerLine: "bg-gray-200",
    alert: "bg-destructive/10 border-destructive/20",
    otpCodeFieldInput: "border-gray-200 focus:border-primary",
    formFieldRow: "mb-4",
    main: "p-8",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <>
      <Show when="signed-in">
        <AppShell>
          <Component />
        </AppShell>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to PowerHub",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Get started with PowerHub",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            
            {/* Protected Routes inside AppShell */}
            <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
            <Route path="/properties"><ProtectedRoute component={Properties} /></Route>
            <Route path="/blocks"><ProtectedRoute component={Blocks} /></Route>
            <Route path="/floors"><ProtectedRoute component={Floors} /></Route>
            <Route path="/room-types"><ProtectedRoute component={RoomTypes} /></Route>
            <Route path="/rooms"><ProtectedRoute component={Rooms} /></Route>
            <Route path="/control-types"><ProtectedRoute component={ControlTypes} /></Route>
            <Route path="/devices"><ProtectedRoute component={Devices} /></Route>
            <Route path="/devices/:id"><ProtectedRoute component={DeviceDetail} /></Route>
            <Route path="/process-types"><ProtectedRoute component={ProcessTypes} /></Route>
            <Route path="/users"><ProtectedRoute component={Users} /></Route>
            <Route path="/roles"><ProtectedRoute component={Roles} /></Route>
            <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
            
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
