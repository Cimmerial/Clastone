import { useEffect, useState } from 'react';
import { useSettingsStore } from '../state/settingsStore';

export function useMobileViewMode() {
  const { settings } = useSettingsStore();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Force tile mode on mobile
  const mode = isMobile ? 'tile' as const : settings.viewMode;
  return { mode, isMobile };
}
