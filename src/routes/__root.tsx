import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "sonner";
import { AppShell } from "../components/AppShell";
import { TrapGuard } from "../components/TrapGuard";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Stranica nije pronađena</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Stranica koju tražite ne postoji ili je premještena.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Vrati se na početnu
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Stranica se nije učitala
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nešto je pošlo po krivu s naše strane. Možete pokušati osvježiti stranicu ili se vratiti na početnu.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Pokušaj ponovo
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Vrati se na početnu
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#e11d2e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Andromeda AI" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "Andromeda AI — Početna" },
      {
        name: "description",
        content:
          "Tri dashboarda: kalkulator predikcija, AI chat mozak i live nogomet. Sve na hrvatskom.",
      },
      { name: "author", content: "Goran Pavić" },
      { property: "og:title", content: "Andromeda AI — Početna" },
      {
        property: "og:description",
        content: "Tri dashboarda: kalkulator predikcija, AI chat mozak i live nogomet. Sve na hrvatskom.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Andromeda AI — Početna" },
      { name: "twitter:description", content: "Tri dashboarda: kalkulator predikcija, AI chat mozak i live nogomet. Sve na hrvatskom." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f9745016-7e41-4413-9c7f-e804e785e729/id-preview-fe5efe10--d7233d3f-ccad-4312-b7a9-a6ec7e371946.lovable.app-1784751962614.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f9745016-7e41-4413-9c7f-e804e785e729/id-preview-fe5efe10--d7233d3f-ccad-4312-b7a9-a6ec7e371946.lovable.app-1784751962614.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "512x512" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="hr" className="dark" style={{ backgroundColor: "#0e1017", colorScheme: "dark" }}>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                background-color: #0e1017 !important;
                color: #f8f9fa !important;
                margin: 0;
                padding: 0;
                color-scheme: dark;
              }
            `,
          }}
        />
        <HeadContent />
      </head>
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        style={{ backgroundColor: "#0e1017", color: "#f8f9fa" }}
      >
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Outlet />
      </AppShell>
      <TrapGuard />
      <Toaster theme="dark" position="top-right" richColors />
    </QueryClientProvider>
  );
}
