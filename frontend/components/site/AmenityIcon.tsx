import { Baby, Coffee, Dumbbell, Flower2, Leaf, Sparkles } from 'lucide-react';

const MAP = { spa: Flower2, coffee: Coffee, yoga: Dumbbell, gym: Dumbbell, kids: Baby, wellness: Sparkles } as const;

export function AmenityIcon({ name }: { name?: string }) {
  const Icon = MAP[(name ?? '') as keyof typeof MAP] ?? Leaf;
  return <Icon size={26} aria-hidden />;
}
