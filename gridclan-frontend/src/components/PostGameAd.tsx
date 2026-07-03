import React, { useEffect, useRef, useState } from 'react';
import { AdModal } from '@components/AdModal';
import { getAdsStatus } from '@services/ads';

/**
 * The post-game popup ad: drop `<PostGameAd over={gameFinished} />` into a
 * game screen and an ad pops up once when the game ends — the watch still
 * pays the player (every completed ad credits the wallet).
 *
 * Skipped entirely when the player bought ad-free months with a gem pack,
 * when ads aren't configured, or when today's earning cap is used up.
 */
export function PostGameAd({ over }: { over: boolean }) {
  const [show, setShow] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (!over || fired.current) return;
    fired.current = true;   // one popup per game, even across re-renders
    let active = true;
    (async () => {
      const status = await getAdsStatus();
      if (!active || !status?.configured || status.adFree || status.remainingToday <= 0) return;
      // Give the game-over UI a beat to land before the ad covers it.
      setTimeout(() => { if (active) setShow(true); }, 1200);
    })();
    return () => { active = false; };
  }, [over]);

  if (!show) return null;
  return <AdModal visible placement="POST_GAME" onClose={() => setShow(false)} />;
}
