import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetBranding,
  useUpdateBranding,
  getGetBrandingQueryKey,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Save, Upload, Tv, ExternalLink, Download, Trash2, MonitorPlay } from 'lucide-react';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

// Downscale an uploaded image to a small PNG data URL so it stays tiny in the
// DB and renders everywhere (login, welcome page, USB export).
function fileToDataUrl(file: File, maxEdge = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image'));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Render the logo centred on the brand colour at 1920x1080 and trigger download,
// entirely client-side — this is the "USB image pack" asset.
function downloadUsbImage(logoUrl: string | null, color: string, name: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = color || '#0f172a';
  ctx.fillRect(0, 0, 1920, 1080);

  const finish = () => {
    const link = document.createElement('a');
    link.download = 'tv-logo-1920x1080.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  if (logoUrl) {
    const img = new Image();
    img.onload = () => {
      const maxW = 1920 * 0.5;
      const maxH = 1080 * 0.5;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (1920 - w) / 2, (1080 - h) / 2, w, h);
      finish();
    };
    img.src = logoUrl;
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name || 'PowerHub', 960, 540);
    finish();
  }
}

export function SmartTv() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: branding, isLoading } = useGetBranding({
    query: { queryKey: getGetBrandingQueryKey() },
  });
  const updateMutation = useUpdateBranding();

  const [brandName, setBrandName] = useState('');
  const [brandColor, setBrandColor] = useState('#2563eb');
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!branding) return;
    setBrandName(branding.brandName ?? '');
    setBrandColor(branding.brandColor ?? '#2563eb');
    setLogo(branding.brandLogoUrl ?? null);
  }, [branding]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please choose an image file (PNG, JPG, SVG).', variant: 'destructive' });
      return;
    }
    try {
      setLogo(await fileToDataUrl(file));
    } catch (err: any) {
      toast({ title: 'Could not load image', description: err?.message ?? 'Try a different file.', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        data: {
          brandName: brandName.trim() || null,
          brandColor: brandColor || null,
          brandLogoUrl: logo,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetBrandingQueryKey() });
      toast({ title: 'Branding saved', description: 'Your logo and colours are live.' });
    } catch (err: any) {
      toast({ title: 'Error saving branding', description: err?.message ?? 'Something went wrong', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const previewName = brandName.trim() || 'PowerHub';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
          <Tv className="h-6 w-6 text-primary" /> Smart TV
        </h1>
        <p className="text-sm text-gray-500">
          Set your logo and brand colours. These appear on the app login screen, the castable TV welcome page, and the downloadable USB image.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Editor */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Brand Identity</CardTitle>
              <CardDescription>Upload a logo and pick the colour used behind it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand / Hotel Name</Label>
                <Input id="brandName" value={brandName} placeholder="e.g. Grand Palace Hotel"
                  onChange={(e) => setBrandName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Logo</Label>
                <div className="flex items-center gap-3">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])} />
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> {logo ? 'Replace logo' : 'Upload logo'}
                  </Button>
                  {logo && (
                    <Button type="button" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => setLogo(null)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-500">PNG, JPG or SVG. Large images are automatically downscaled.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brandColor">Brand Colour</Label>
                <div className="flex items-center gap-3">
                  <input id="brandColor" type="color" value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-gray-200" />
                  <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-32" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><MonitorPlay className="h-4 w-4" /> Castable Welcome Page</CardTitle>
              <CardDescription>
                A full-screen logo page you can cast or screen-mirror to a room TV on demand.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <a href={`${basePath}/welcome`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open welcome page
                </a>
              </Button>
              <p className="mt-2 text-xs text-gray-500">Save your changes first so the page shows the latest logo.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> USB Image Pack</CardTitle>
              <CardDescription>
                Download a 1920×1080 logo image to display from a USB stick as a photo / screensaver on the TV.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" variant="outline" onClick={() => downloadUsbImage(logo, brandColor, previewName)}>
                <Download className="mr-2 h-4 w-4" /> Download TV image (1920×1080)
              </Button>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-500">
                <li>Copy the downloaded image onto a USB flash drive.</li>
                <li>Plug the USB drive into the TV and open its Photos / Media / USB source.</li>
                <li>Open the image and set it as a slideshow or leave it on screen while idle.</li>
                <li>Note: consumer TVs cannot show this automatically at power-on — that requires manufacturer firmware. It appears when the USB photo source is selected or the TV is idle.</li>
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Live preview */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Welcome Page Preview</Label>
          <div className="overflow-hidden rounded-xl border shadow-sm">
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center"
              style={{ backgroundColor: brandColor }}>
              {logo ? (
                <img src={logo} alt={previewName} className="max-h-[55%] max-w-[80%] object-contain drop-shadow" />
              ) : (
                <div className="text-2xl font-extrabold text-white drop-shadow">{previewName}</div>
              )}
              {logo && <div className="text-sm font-semibold text-white/90">{previewName}</div>}
            </div>
          </div>
          <p className="text-xs text-gray-500">This is how the castable page and TV image will look.</p>
        </div>
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Branding
        </Button>
      </div>
    </div>
  );
}
