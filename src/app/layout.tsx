import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth/context";
import { ConvexConfigProvider } from "@/lib/convex/provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kakograph",
  description: "Write first, organize later. Zero-knowledge, local-first note-taking.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kakograph",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // 1. URL-triggered repair
              if (window.location.search.includes('repair=1')) {
                localStorage.removeItem('kakograph_convex_url');
                localStorage.removeItem('kakograph_sync_enabled');
                localStorage.removeItem('kakograph_session');
                
                // Clear PWA caches
                if ('caches' in window) {
                  caches.keys().then(names => {
                    for (let name of names) caches.delete(name);
                  });
                }
                
                // Unregister Workers
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(regs => {
                    for (let reg of regs) reg.unregister();
                  });
                }

                const url = new URL(window.location);
                url.searchParams.delete('repair=1');
                window.history.replaceState({}, '', url);
                alert('App Repaired: Cache cleared and settings reset.');
                window.location.reload();
              }

              // 2. Automatic Crash Loop Protection
              try {
                const CRASH_KEY = 'kakograph_crash_count';
                const now = Date.now();
                const lastLoad = parseInt(sessionStorage.getItem('kakograph_last_load') || '0');
                let count = parseInt(sessionStorage.getItem(CRASH_KEY) || '0');

                if (now - lastLoad < 3000) { // If reloaded within 3 seconds
                  count++;
                  sessionStorage.setItem(CRASH_KEY, count.toString());
                } else {
                  sessionStorage.setItem(CRASH_KEY, '0');
                }
                sessionStorage.setItem('kakograph_last_load', now.toString());

                if (count >= 3) {
                  sessionStorage.setItem(CRASH_KEY, '0');
                  localStorage.removeItem('kakograph_sync_enabled'); // Disable sync as it is the most likely cause
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(regs => {
                      for (let reg of regs) reg.unregister();
                      window.location.reload();
                    });
                  }
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-slate-900 text-slate-100`}
        suppressHydrationWarning
      >
        <ConvexConfigProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ConvexConfigProvider>
      </body>
    </html>
  );
}

