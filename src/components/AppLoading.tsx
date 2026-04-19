import type { CSSProperties } from 'react';

const SHIMMER_DURATION_SECONDS = 6;
const shimmerStartMs = Date.now();

type AppLoadingProps = {
  message: string;
};

export function AppLoading({ message }: AppLoadingProps) {
  const elapsedSeconds = (Date.now() - shimmerStartMs) / 1000;
  const shimmerDelay = `-${elapsedSeconds % SHIMMER_DURATION_SECONDS}s`;
  const style = { '--clastone-shimmer-delay': shimmerDelay } as CSSProperties;

  return (
    <div className="app-loading" style={style}>
      <p>{message}</p>
    </div>
  );
}
