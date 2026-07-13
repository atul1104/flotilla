export function Logo({ className = 'h-6 w-6' }) {
  // A flotilla of rafts: three offset squares. Sharp, monospace-friendly.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" fill="currentColor" />
      <rect x="13" y="2" width="8" height="8" fill="currentColor" opacity="0.55" />
      <rect x="7.5" y="13" width="8" height="8" fill="currentColor" opacity="0.8" />
    </svg>
  );
}
