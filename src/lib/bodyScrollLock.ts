let activeBodyScrollLocks = 0;
let previousBodyOverflow: string | null = null;

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;

  if (activeBodyScrollLocks === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  activeBodyScrollLocks += 1;
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (activeBodyScrollLocks === 0) return;

  activeBodyScrollLocks -= 1;

  if (activeBodyScrollLocks === 0) {
    document.body.style.overflow = previousBodyOverflow || 'unset';
    previousBodyOverflow = null;
  }
}
