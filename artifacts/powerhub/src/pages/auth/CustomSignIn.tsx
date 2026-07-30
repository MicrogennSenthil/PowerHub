// ---------------------------------------------------------------------------
// Custom sign-in page — email/password, Forgot Password (Clerk reset) and
// WhatsApp OTP (via our backend ticket flow).
// ---------------------------------------------------------------------------
import { useState } from 'react';
import { useSignIn } from '@clerk/react';
import { useLocation } from 'wouter';
import { Loader2, MessageCircle, Lock, Mail, ArrowLeft, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type Step =
  | 'email'
  | 'password'
  | 'forgot-check'
  | 'forgot-code'
  | 'forgot-new-password'
  | 'wa-otp-sent'
  | 'done';

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
  const [maskedPhone, setMaskedPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStep('password');
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        setLocation('/dashboard');
      } else {
        toast({ title: 'Sign in incomplete', description: 'Unexpected auth state. Please try again.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({
        title: 'Sign in failed',
        description: err?.errors?.[0]?.longMessage ?? err?.message ?? 'Invalid credentials',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/reset/check?email=${encodeURIComponent(email.trim())}`);
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
      // Use Clerk's built-in email reset code flow
      if (!signIn) throw new Error('Sign-in not available');
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });
      setStep('forgot-code');
      toast({ title: 'Reset code sent', description: 'Check your email for the reset code.' });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.errors?.[0]?.longMessage ?? err?.message ?? 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

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
        toast({ title: 'Unexpected state', description: 'Please try again.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({
        title: 'Invalid code',
        description: err?.errors?.[0]?.longMessage ?? 'The code is incorrect or expired.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

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
        toast({ title: 'Unexpected state', description: 'Please try again.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.errors?.[0]?.longMessage ?? err?.message ?? 'Could not set new password',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestWhatsAppOtp() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), purpose: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'WhatsApp OTP failed', description: data.error ?? 'Could not send OTP', variant: 'destructive' });
        return;
      }
      setMaskedPhone(data.maskedPhone ?? '');
      setOtp('');
      setStep('wa-otp-sent');
      toast({ title: 'OTP sent', description: `Code sent to WhatsApp ${data.maskedPhone}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleWhatsAppOtpVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim() || !signIn) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: otp.trim(), purpose: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Invalid OTP', description: data.error ?? 'OTP incorrect or expired', variant: 'destructive' });
        return;
      }
      // Sign in with the Clerk ticket
      const result = await signIn.create({ strategy: 'ticket', ticket: data.ticket });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        setLocation('/dashboard');
      } else {
        toast({ title: 'Unexpected state', description: 'Please try again.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.errors?.[0]?.longMessage ?? err?.message ?? 'Sign-in failed',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // ---- Render ----

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / brand */}
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
              <Button type="submit" className="w-full">Continue</Button>
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
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>

              <div className="flex flex-col items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={handleRequestWhatsAppOtp}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 hover:underline disabled:opacity-50"
                >
                  <MessageCircle className="h-4 w-4" />
                  Sign in with WhatsApp OTP instead
                </button>
              </div>
            </form>
          )}

          {/* Step: Forgot — enter code from email */}
          {step === 'forgot-code' && (
            <form onSubmit={handleForgotCodeVerify} className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  We sent a reset code to <strong>{email}</strong>. Enter it below.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-code">Reset code</Label>
                <Input
                  id="reset-code"
                  placeholder="6-digit code"
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

          {/* Step: Forgot — set new password */}
          {step === 'forgot-new-password' && (
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-gray-600">Code verified. Enter a new password for your account.</p>
              </div>
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
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Set new password
              </Button>
            </form>
          )}

          {/* Step: WhatsApp OTP — enter code */}
          {step === 'wa-otp-sent' && (
            <form onSubmit={handleWhatsAppOtpVerify} className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p className="text-sm text-green-800">
                  A 6-digit OTP was sent to WhatsApp number ending in <strong>{maskedPhone.slice(-4)}</strong>.
                  It expires in 10 minutes.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wa-otp">WhatsApp OTP</Label>
                <Input
                  id="wa-otp"
                  placeholder="6-digit code"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify &amp; sign in
              </Button>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleRequestWhatsAppOtp}
                  disabled={loading}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  Resend OTP
                </button>
                <button
                  type="button"
                  onClick={() => setStep('password')}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Use password instead
                </button>
              </div>
            </form>
          )}

          {/* Success */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="text-sm text-gray-600">Signed in! Redirecting…</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          PowerHub by Microgenn &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
