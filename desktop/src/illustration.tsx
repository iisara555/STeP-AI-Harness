import sheet from './assets/illustrations/section-art-sheet.png';

// Viewports into the approved artwork keep all six scenes on one cached image. Presentation labels stay outside
// these bounds; the drawings are decorative, with the surrounding headings providing their meaning.
const scenes = {
  chat: [35, 166],
  workspace: [545, 166],
  skills: [1055, 166],
  receipt: [35, 633],
  connections: [545, 633],
  browser: [1055, 633],
} as const;

export function SectionArt({ scene, className = '' }: { scene: keyof typeof scenes; className?: string }) {
  const [x, y] = scenes[scene];
  return (
    <span className={`section-art ${className}`} data-scene={scene} aria-hidden="true">
      <img src={sheet} alt="" draggable={false} style={{ left: `${(-x / 440) * 100}%`, top: `${(-y / 390) * 100}%` }} />
    </span>
  );
}
