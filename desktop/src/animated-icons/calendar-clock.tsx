import { motion, useAnimation, type Variants } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

// Not from lucide-animated: the Lucide calendar-clock drawing whose clock hand sweeps once, written here in the same
// shape as the copied icons so the rail can drive it.
export interface CalendarClockIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface CalendarClockIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const HAND_VARIANTS: Variants = {
  normal: { rotate: 0, transition: { duration: 0.3 } },
  animate: { rotate: 360, transition: { duration: 0.8, ease: 'easeInOut' } },
};

const CalendarClockIcon = forwardRef<CalendarClockIconHandle, CalendarClockIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start('animate'),
        stopAnimation: () => controls.start('normal'),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start('animate');
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start('normal');
        }
      },
      [controls, onMouseLeave],
    );

    return (
      <div className={className} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h5" />
          <circle cx="16" cy="16" r="6" />
          <motion.path
            animate={controls}
            d="M17.5 17.5 16 16.3V14"
            initial="normal"
            // Turns about the clock's centre (16, 16): the left edge and four-sevenths down the hand's own box.
            style={{ originX: 0, originY: 0.571 }}
            variants={HAND_VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

CalendarClockIcon.displayName = 'CalendarClockIcon';

export { CalendarClockIcon };
