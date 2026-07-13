const COLORS = [
  '#1c1c1c',
  '#ff5c35',
  '#1f9d55',
  '#2563eb',
  '#9333ea',
  '#d97706',
  '#0891b2',
  '#db2777',
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name = '?', src, size = 32, className = '' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={`${className} object-cover`}
      />
    );
  }
  const initial = (name || '?').charAt(0).toUpperCase();
  const bg = COLORS[hash(name || '') % COLORS.length];
  return (
    <div
      className={`flex shrink-0 items-center justify-center font-mono font-semibold text-white ${className}`}
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}
