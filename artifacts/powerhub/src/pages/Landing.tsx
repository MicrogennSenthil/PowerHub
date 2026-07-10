import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { SignInButton } from '@clerk/react';
import { Zap, ShieldCheck, Cpu, Building2 } from 'lucide-react';

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex h-16 items-center justify-between border-b bg-white px-6 md:px-12">
        <div className="flex items-center gap-2 text-primary">
          <Zap className="h-6 w-6 fill-current" />
          <span className="text-xl font-bold tracking-tight text-slate-900">PowerHub</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Sign In
          </Link>
          <Link href="/sign-up">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
              Intelligent power automation for modern hotels
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Control room relays, optimize energy consumption, and manage multi-tenant hotel properties from a single pane of glass.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link href="/sign-in">
                <Button size="lg" className="h-12 px-8 text-base">
                  Access Dashboard
                </Button>
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-24 max-w-5xl sm:mt-32">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="flex flex-col items-center rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <Building2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Multi-tenant Architecture</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Manage multiple hotel properties under one organization with granular role-based access control.
                </p>
              </div>
              <div className="flex flex-col items-center rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <Cpu className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Relay Automation</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Directly interface with ESP32 relay boxes. Automate cutoffs for cleaning, visiting, and checkout workflows.
                </p>
              </div>
              <div className="flex flex-col items-center rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Enterprise Security</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Secure access for front-desk staff, managers, and system administrators using Clerk authentication.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t bg-white py-8 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} PowerHub Systems. All rights reserved.</p>
      </footer>
    </div>
  );
}
