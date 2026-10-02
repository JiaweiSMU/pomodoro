export default function IconButton({ label, children, size = 'size-10', display = 'grid', solid = false, active = false, ...rest }) {
  const tone = solid
    ? 'bg-accent text-on-accent'
    : `${active ? 'text-accent' : 'text-muted hover:text-ink'} hover:bg-accent-soft disabled:hover:bg-transparent`
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${display} ${size} shrink-0 place-items-center rounded-md transition-colors disabled:opacity-40 ${tone}`}
      {...rest}
    >
      {children}
    </button>
  )
}
