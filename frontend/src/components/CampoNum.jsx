export default function CampoNum({ label, value, onChange, width = 'w-16' }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-dim)' }}>{label}</span>
      <input type="number" value={value ?? 0} onChange={e => onChange(Number(e.target.value))}
        className={`${width} text-center py-1 rounded font-medium`}
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
    </div>
  );
}
