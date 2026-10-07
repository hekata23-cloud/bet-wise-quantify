import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/over-under")({
  component: OverUnderLayout,
});

function OverUnderLayout() {
  return (
    <div className="ou-scope">
      <Outlet />
    </div>
  );
}
