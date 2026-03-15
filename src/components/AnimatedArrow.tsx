import { ArrowLeft } from 'lucide-react';
import './AnimatedArrow.css';

interface AnimatedArrowProps {
  className?: string;
  size?: number;
}

export function AnimatedArrow({ className = '', size = 14 }: AnimatedArrowProps) {
  return (
    <div className={`animated-arrow ${className}`}>
      <ArrowLeft size={size} />
    </div>
  );
}
