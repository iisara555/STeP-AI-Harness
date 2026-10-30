# Animated icons

Copied unchanged in drawing from [lucide-animated](https://lucide-animated.com) (github.com/pqoqubbw/icons, MIT, see
`LICENSE`): the Lucide icons the app already uses, animated with `motion`. Only edits: the `"use client"` line and the
`cn()` helper are removed. The sidebar rail plays them on hover or keyboard focus; motion stops when the computer is
set to reduce motion.

`megaphone.tsx` (สื่อภายใน) is not from lucide-animated, which has no megaphone: it is the Lucide megaphone drawing
with a short wiggle, written in the same shape as the copied icons.

`calendar-clock.tsx` (งานตั้งเวลา) is not from lucide-animated either: the Lucide calendar-clock drawing whose clock hand
sweeps once, in the same shape.

The rest of the renderer imports Lucide drawings through `../icons.tsx`. This shared adapter plays one bounded
movement on the nearest control's pointer hover or keyboard focus without changing the drawing, SVG props or hit
target. Decorative icons and disabled controls stay still; loading spinners keep their existing activity behavior.
`../reduced-motion.ts` observes the system preference while the app is open. Enabling Reduce Motion cancels active
adapter animations and uses static Lucide drawings in the rail, including paths that MotionConfig alone would not stop.
