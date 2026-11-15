export interface InstallEnvironment {
  userAgent: string;
  maxTouchPoints?: number;
  displayModeStandalone?: boolean;
  navigatorStandalone?: boolean;
}

export interface InstallPlatformInfo {
  isInstalled: boolean;
  isIOS: boolean;
  isIPadOS: boolean;
  isIOSSafari: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  platformLabel: 'Installed App' | 'iOS' | 'Android' | 'Desktop';
}

export function detectInstallPlatform(env: InstallEnvironment): InstallPlatformInfo {
  const ua = (env.userAgent || '').toLowerCase();
  const touchPoints = env.maxTouchPoints ?? 0;

  const isInstalled = Boolean(env.displayModeStandalone || env.navigatorStandalone);
  const isIPhoneOrIPod = /iphone|ipod/.test(ua);
  const isIPadUA = /ipad/.test(ua);
  const isIPadOS = !isIPadUA && /macintosh/.test(ua) && touchPoints > 1;
  const isIOS = isIPhoneOrIPod || isIPadUA || isIPadOS;
  const isAndroid = /android/.test(ua);
  const isDesktop = !isIOS && !isAndroid;

  // On iOS, Safari has "safari" without CriOS (Chrome), FxiOS (Firefox), EdgiOS (Edge), or GSA
  const isIOSSafari =
    isIOS &&
    /safari/.test(ua) &&
    !/crios|fxios|edgios|opios|gsa/.test(ua);

  const platformLabel: InstallPlatformInfo['platformLabel'] = isInstalled
    ? 'Installed App'
    : isIOS
      ? 'iOS'
      : isAndroid
        ? 'Android'
        : 'Desktop';

  return {
    isInstalled,
    isIOS,
    isIPadOS,
    isIOSSafari,
    isAndroid,
    isDesktop,
    platformLabel,
  };
}

export function isBypassCachePath(pathname: string): boolean {
  if (!pathname) return true;
  if (pathname.startsWith('/api/')) return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname.startsWith('/_next/webpack-hmr')) return true;
  return false;
}

export function isCacheableStaticPath(pathname: string): boolean {
  if (isBypassCachePath(pathname)) return false;
  if (pathname.startsWith('/_next/static/')) return true;
  return /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|css|js)$/i.test(pathname);
}
