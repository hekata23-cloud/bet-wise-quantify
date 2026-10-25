import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { LearnShell } from "@/learn/components/LearnShell";
import { LearnLoading } from "@/learn/components/learn-ui";
import { useLearnState } from "@/learn/store";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Lingua — Immersive Language Learning" },
      {
        name: "description",
        content:
          "Leveled courses, vocabulary, grammar, listening and shadowing drills, progress tracking and a learner community.",
      },
    ],
  }),
  component: LearnLayout,
});

/**
 * Layout for the whole /learn module. It keeps the module client-only (the
 * learner store lives in localStorage) and routes anonymous visitors to the
 * sign-in page.
 */
function LearnLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { currentUserId } = useLearnState();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isLogin = pathname === "/learn/login";

  useEffect(() => {
    if (mounted && !currentUserId && !isLogin) {
      navigate({ to: "/learn/login", replace: true });
    }
  }, [mounted, currentUserId, isLogin, navigate]);

  if (!mounted) return <LearnLoading />;
  if (isLogin) return <Outlet />;
  if (!currentUserId) return <LearnLoading label="Redirecting to sign in…" />;

  return (
    <LearnShell>
      <Outlet />
    </LearnShell>
  );
}
