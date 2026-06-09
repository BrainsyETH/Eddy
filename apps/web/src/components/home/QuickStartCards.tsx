// src/components/home/QuickStartCards.tsx
// 4-card grid for quick feature discovery on the landing page

import Link from 'next/link';
import Image from 'next/image';
import { Activity, Map, Code, ChevronRight } from 'lucide-react';

const EDDY_FAVICON = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

const cards = [
  {
    href: '/gauges',
    icon: <Activity className="w-6 h-6 text-primary-600" />,
    title: 'Check Conditions',
    description: 'Live levels for all 8 rivers',
  },
  {
    href: '#plan',
    icon: <Map className="w-6 h-6 text-primary-600" />,
    title: 'Plan a Float',
    description: 'Pick your river, put-in & take-out',
  },
  {
    href: '/chat',
    icon: 'eddy' as const,
    title: 'Ask Eddy',
    description: 'AI-powered trip planning',
  },
  {
    href: '/embed',
    icon: <Code className="w-6 h-6 text-primary-600" />,
    title: 'Embed Widgets',
    description: 'Add live river data to your site',
  },
] as const;

export default function QuickStartCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {cards.map((card) => (
        <Link
          key={card.title}
          href={card.href}
          className="group flex flex-col gap-2 p-4 md:p-5 bg-white border border-neutral-200 rounded-xl hover:border-primary-300 hover:shadow-md transition-all no-underline"
        >
          <div className="flex items-center justify-between">
            {card.icon === 'eddy' ? (
              <Image src={EDDY_FAVICON} alt="Eddy" width={28} height={28} className="rounded-md" />
            ) : (
              card.icon
            )}
            <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-primary-400 transition-colors" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900">{card.title}</h3>
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{card.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
