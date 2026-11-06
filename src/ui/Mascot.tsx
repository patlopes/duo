import { useState } from 'react';
import type { Animal } from '../schemas/settingsDefaults';

export type Pose = 'happy' | 'cheer' | 'worried' | 'wink';

const LABEL: Record<Animal, string> = { giraffe: 'Girafa', monkey: 'Macaquinho' };

const JOKES = [
  'A girafa vê as contas de longe.',
  'O macaquinho já pendurou o boleto.',
  'Pescoço comprido, conta curtinha.',
  'Banana não paga aluguel. Já tentamos.',
  'Quem divide de um jeito justo dorme melhor.',
  'Girafa não entra no vermelho: ela vê de cima.',
  'Macaco velho não esquece o vencimento.',
];

export function randomJoke(): string {
  return JOKES[Math.floor(Math.random() * JOKES.length)]!;
}

/** Tapping makes it jump. Purely for fun: nothing in the app depends on it. */
export function Mascot({
  animal,
  pose = 'happy',
  size,
  idle = false,
  delay = 0,
  onTap,
}: {
  animal: Animal;
  pose?: Pose;
  size?: number;
  idle?: boolean;
  delay?: number;
  onTap?: () => void;
}) {
  const [jumping, setJumping] = useState(false);
  const motion = jumping
    ? 'mascot-jump'
    : pose === 'cheer'
      ? 'mascot-cheer'
      : idle
        ? 'mascot-idle'
        : '';
  const src = `${import.meta.env.BASE_URL}mascots/${animal}-${jumping ? 'cheer' : pose}.webp`;

  return (
    <button
      type="button"
      className={`mascot ${motion}`}
      style={{ width: size, ['--delay' as string]: `${delay}s` }}
      aria-label={LABEL[animal]}
      onClick={() => {
        setJumping(true);
        onTap?.();
      }}
      onAnimationEnd={(e) => {
        if (e.animationName === 'mascot-jump') setJumping(false);
      }}
    >
      <img src={src} alt="" draggable={false} />
    </button>
  );
}
