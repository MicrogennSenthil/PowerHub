import { useGetBranding, getGetBrandingQueryKey } from '@workspace/api-client-react';

// Full-screen, chrome-free branding page designed to be cast / screen-mirrored
// to a TV. No auth, no navigation — just the logo on the brand colour.
export function Welcome() {
  const { data: branding } = useGetBranding({
    query: { queryKey: getGetBrandingQueryKey() },
  });

  const bg = branding?.brandColor || '#0f172a';
  const name = branding?.brandName || 'PowerHub';
  const logo = branding?.brandLogoUrl || null;

  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-8 p-8 text-center"
      style={{ backgroundColor: bg }}
    >
      {logo ? (
        <img
          src={logo}
          alt={name}
          className="max-h-[45vh] max-w-[80vw] object-contain drop-shadow-xl"
        />
      ) : (
        <div className="text-5xl font-extrabold tracking-tight text-white drop-shadow sm:text-7xl">
          {name}
        </div>
      )}
      {logo && (
        <div className="text-2xl font-semibold tracking-tight text-white/90 sm:text-4xl">
          {name}
        </div>
      )}
    </div>
  );
}
