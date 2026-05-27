import { tryScheduleRustoreReviewAfterFirstRouteBuilt } from '@/shared/lib/rustore-review';
import { useEffect, useRef } from 'react';

type UseRustoreReviewOnFirstBuiltRouteParams = {
  enabled: boolean;
};

export function useRustoreReviewOnFirstBuiltRoute({ enabled }: UseRustoreReviewOnFirstBuiltRouteParams) {
  const scheduledRef = useRef(false);

  useEffect(() => {
    if (!enabled || scheduledRef.current) return;
    scheduledRef.current = true;
    void tryScheduleRustoreReviewAfterFirstRouteBuilt();
  }, [enabled]);
}
