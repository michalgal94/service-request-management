type IconName = 'service' | 'search' | 'plus' | 'check' | 'inbox' | 'chevron' | 'error';
const paths: Record<IconName, string> = {
  service: 'M4 4h16v12h-9l-5 4v-4H4z M8 8h8 M8 12h5',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12l4 4L19 6',
  inbox: 'M4 4h16l2 12v4H2v-4z M2 15h6l2 3h4l2-3h6',
  chevron: 'M7 10l5 5 5-5',
  error: 'M12 8v5 M12 16h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
