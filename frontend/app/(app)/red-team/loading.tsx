export default function RedTeamLoading() {
  return (
    <div className="space-y-4 py-2" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted/40" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted/30" />
      <div className="h-40 animate-pulse rounded-md bg-muted/20" />
      <div className="h-24 animate-pulse rounded-md bg-muted/15" />
    </div>
  );
}
