import { APP_NAME } from '#shared';
import { useEffect } from 'react';

/** Sets document.title so each screen is announced and identifiable in browser history. */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
