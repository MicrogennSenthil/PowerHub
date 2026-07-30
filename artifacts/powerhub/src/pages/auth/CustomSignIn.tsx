// ---------------------------------------------------------------------------
// Custom sign-in page — email/password and Forgot Password (Clerk reset flow).
// WhatsApp OTP has been removed; only password-based sign-in is supported.
// ---------------------------------------------------------------------------
import { useState } from 'react';
import { useSignIn } from '@clerk/react';
import { useLocation } from 'wouter';
import { Loader2, Lock, Mail, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type Step =
  | 'email'
  | 'password'
  | 'forgot-code'
  | 'forgot-new-password';

export function CustomSignIn() {
  const { signIn, setActive } = useSignIn();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Step 1: email ──────────────────────────────────────────────────────────
  async function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStep('password');
  }

  // ── Step 2: password ───────────────────────────────────────────────────────
  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setLoading(true);
    try {
      // Step A: create sign-in with identifier only.
      // Clerk may return 'complete' immediately (password already in create)
      // or 'needs_first_factor' (we must explicitly attempt the password).
      let attempt = await signIn.create({ identifier: email.trim() });

      // If Clerk resolved it already (some configurations do this)
      if (attempt.status === 'complete') {
        await setActive!({ session: attempt.createdSessionId });
        setLocation('/dashboard');
        return;
      }

      // Step B: attempt the password as the first factor.
      if (attempt.status === 'needs_first_factor') {
        const passwordFactor = attempt.supportedFirstFactors?.find(
          (f: any) => f.strategy === 'password',
        );

        if (passwordFactor) {
          attempt = await attempt.attemptFirstFactor({
            strategy: 'password',
            password,
          } as any);

          if (attempt.status === 'complete') {
            await setActive!({ session: attempt.createdSessionId });
            setLocation('/dashboard');
            return;
          }

          // Clerk now requires an additional email code (new-device check).
          if (attempt.status === 'needs_second_factor' ||
              attempt.status === 'needs_first_factor') {
            const emailFactor = attempt.supportedFirstFactors?.find(
              (f: any) => f.strategy === 'email_code',
            );
            if (emailFactor) {
              await attempt.prepareFirstFactor({
                strategy: 'email_code',
                emailAddressId: (emailFactor as any).emailAddressId,
              });
              toast({
                title: 'Verification required',
                description: 'A code has been sent to your email. Enter it below.',
              });
              setStep('forgot-code');
              setLoading(false);
              return;
            }
          }
        }
      }

      // Fallback — surface whatever state Clerk is in for diagnosis.
      toast({
        title: 'Sign in incomplete',
        description: `Unexpected sign-in state: ${attempt.status ?? 'null'}. Please contact your administrator.`,
        variant: 'destructive',
      });
    } catch (err: any) {
      toast({
        title: 'Sign in failed',
        description:
          err?.errors?.[0]?.longMessage ??
          err?.message ??
          'Invalid email or password.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password: send reset code ───────────────────────────────────────
  async function handleForgotPassword() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/auth/reset/check?email=${encodeURIComponent(email.trim())}`,
      );
      const data = await res.json();
      if (!data.eligible) {
        toast({
          title: 'Password reset unavailable',
          description: data.reason ?? 'Contact your system administrator.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }
      if (!signIn) throw new Error('Sign-in not available');
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });
      setOtp('');
      setStep('forgot-code');
      toast({
        title: 'Reset code sent',
        description: 'Check your email for the 6-digit code.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description:
          err?.errors?.[0]?.longMessage ??
          err?.message ??
          'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password: verify code ───────────────────────────────────────────
  async function handleForgotCodeVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !otp.trim()) return;
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: otp.trim(),
      });
      if (result.status === 'needs_new_password') {
        setStep('forgot-new-password');
      } else {
        toast({
          title: 'Unexpected state',
          description: 'Please try again.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Invalid code',
        description:
          err?.errors?.[0]?.longMessage ?? 'The code is incorrect or expired.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password: set new password ─────────────────────────────────────
  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !newPassword.trim()) return;
    setLoading(true);
    try {
      const result = await signIn.resetPassword({ password: newPassword });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        toast({ title: 'Password updated', description: 'You are now signed in.' });
        setLocation('/dashboard');
      } else {
        toast({
          title: 'Unexpected state',
          description: 'Please try again.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description:
          err?.errors?.[0]?.longMessage ??
          err?.message ??
          'Could not set new password',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Brand */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <span className="text-xl font-bold text-primary-foreground">⚡</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">PowerHub</h1>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">

          {/* Step: Email */}
          {step === 'email' && (
            <form onSubmit={handleEmailContinue} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="pl-9"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          )}

          {/* Step: Password */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSignIn} className="space-y-4">
              <button
                type="button"
                onClick={() => setStep('email')}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {email}
              </button>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="pl-9 pr-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>

              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>
            </form>
          )}

          {/* Step: Enter reset code from email */}
          {step === 'forgot-code' && (
            <form onSubmit={handleForgotCodeVerify} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                We sent a reset code to <strong>{email}</strong>. Enter it below.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reset-code">Reset code</Label>
                <Input
                  id="reset-code"
                  placeholder="6-digit code"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify code
              </Button>
              <button
                type="button"
                onClick={() => setStep('password')}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 w-full justify-center"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </button>
            </form>
          )}

          {/* Step: Set new password */}
          {step === 'forgot-new-password' && (
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Code verified. Enter a new password for your account.
              </p>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pl-9 pr-9"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Set new password
              </Button>
            </form>
          )}

        </div>

        <p className="text-center text-xs text-gray-400">
          PowerHub by Microgenn &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
