'use client';

// src/app/guides/checklist/page.tsx
// Interactive float trip packing checklist

import { useState } from 'react';
import { CheckSquare, Square, Sun, Moon, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';

const EDDY_FLAG_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_Flag.png';

interface ChecklistCategory {
  name: string;
  emoji: string;
  items: ChecklistItem[];
}

interface ChecklistItem {
  name: string;
  overnightOnly?: boolean;
  note?: string;
}

const CHECKLIST: ChecklistCategory[] = [
  {
    name: 'Safety Essentials',
    emoji: '🛟',
    items: [
      { name: 'Life jacket / PFD (one per person)' },
      { name: 'Whistle (attached to PFD)' },
      { name: 'First aid kit' },
      { name: 'Phone in waterproof case or dry bag' },
      { name: 'Flashlight or headlamp', note: 'For exploring caves and springs' },
      { name: 'River map or downloaded offline map' },
    ],
  },
  {
    name: 'Sun & Weather Protection',
    emoji: '☀️',
    items: [
      { name: 'Sunscreen (SPF 30+, reef-safe preferred)' },
      { name: 'Sunglasses with strap' },
      { name: 'Hat with brim' },
      { name: 'Rain jacket or poncho', note: 'Weather changes fast in the Ozarks' },
      { name: 'Bug spray' },
    ],
  },
  {
    name: 'Gear & Equipment',
    emoji: '🛶',
    items: [
      { name: 'Paddles (with spare if possible)' },
      { name: 'Dry bags for gear and valuables' },
      { name: 'Rope or bungee cords for securing gear' },
      { name: 'Cooler (secured in vessel)' },
      { name: 'Water shoes or river sandals', note: 'Rocks are sharp — no bare feet!' },
      { name: 'Trash bag (leave no trace)' },
    ],
  },
  {
    name: 'Food & Hydration',
    emoji: '🥪',
    items: [
      { name: 'Water (1 gallon per person minimum)' },
      { name: 'Snacks and lunch', note: 'Sandwiches, trail mix, fruit' },
      { name: 'Reusable water bottle' },
      { name: 'Beverages in cans (no glass on the river!)' },
    ],
  },
  {
    name: 'Comfort & Convenience',
    emoji: '😎',
    items: [
      { name: 'Towel' },
      { name: 'Change of dry clothes (in dry bag)' },
      { name: 'Car key in waterproof container' },
      { name: 'Camera or GoPro', note: 'Waterproof recommended' },
      { name: 'Fishing gear', note: 'Missouri fishing license required' },
      { name: 'Camp chair or sit pad for gravel bars' },
    ],
  },
  {
    name: 'Overnight / Camping Additions',
    emoji: '🏕️',
    items: [
      { name: 'Tent and stakes', overnightOnly: true },
      { name: 'Sleeping bag and pad', overnightOnly: true },
      { name: 'Camp stove and fuel', overnightOnly: true },
      { name: 'Cooking utensils and dishes', overnightOnly: true },
      { name: 'Lighter / waterproof matches', overnightOnly: true },
      { name: 'Headlamp with extra batteries', overnightOnly: true },
      { name: 'Water filter or purification tablets', overnightOnly: true },
      { name: 'Biodegradable soap', overnightOnly: true },
      { name: 'Tarp for rain shelter', overnightOnly: true },
      { name: 'Extra layers for evening', overnightOnly: true, note: 'River valleys get cool at night' },
    ],
  },
];

export default function ChecklistPage() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [tripType, setTripType] = useState<'day' | 'overnight'>('day');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CHECKLIST.map(c => c.name))
  );

  const toggleItem = (item: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Filter items based on trip type
  const getVisibleItems = (category: ChecklistCategory) => {
    if (tripType === 'overnight') return category.items;
    return category.items.filter(item => !item.overnightOnly);
  };

  const totalItems = CHECKLIST.flatMap(c => getVisibleItems(c)).length;
  const checkedCount = CHECKLIST.flatMap(c => getVisibleItems(c)).filter(item => checked.has(item.name)).length;
  const progress = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <section className="py-12 md:py-16" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
        <div className="max-w-3xl mx-auto px-4 text-center">
          <Image
            src={EDDY_FLAG_IMAGE}
            alt="Eddy the Otter with a flag"
            width={120}
            height={120}
            className="mx-auto h-24 w-auto mb-3"
          />
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Float Trip Checklist
          </h1>
          <p className="text-lg text-white/80">
            Don&apos;t forget the sunscreen. Or the life jacket. Or the...
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-8">
        {/* Trip Type Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 bg-white rounded-lg border border-neutral-200 p-1">
            <button
              onClick={() => setTripType('day')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                tripType === 'day'
                  ? 'bg-primary-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <Sun className="w-4 h-4" />
              Day Trip
            </button>
            <button
              onClick={() => setTripType('overnight')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                tripType === 'overnight'
                  ? 'bg-primary-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <Moon className="w-4 h-4" />
              Overnight
            </button>
          </div>

          {/* Progress */}
          <div className="text-right">
            <p className="text-sm font-semibold text-neutral-900">
              {checkedCount} / {totalItems} packed
            </p>
            <div className="w-32 h-2 bg-neutral-200 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-support-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Checklist Categories */}
        <div className="space-y-4">
          {CHECKLIST.map((category) => {
            const visibleItems = getVisibleItems(category);
            if (visibleItems.length === 0) return null;
            const categoryChecked = visibleItems.filter(item => checked.has(item.name)).length;
            const isExpanded = expandedCategories.has(category.name);

            return (
              <div key={category.name} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <button
                  onClick={() => toggleCategory(category.name)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{category.emoji}</span>
                    <h3 className="text-base font-bold text-neutral-900">{category.name}</h3>
                    <span className="text-xs text-neutral-500">
                      {categoryChecked}/{visibleItems.length}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-5 pb-4 space-y-1">
                    {visibleItems.map((item) => {
                      const isChecked = checked.has(item.name);
                      return (
                        <button
                          key={item.name}
                          onClick={() => toggleItem(item.name)}
                          className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                            isChecked
                              ? 'bg-support-50'
                              : 'hover:bg-neutral-50'
                          }`}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-5 h-5 text-support-500 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-5 h-5 text-neutral-300 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className={`text-sm ${isChecked ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>
                              {item.name}
                            </span>
                            {item.note && (
                              <p className="text-xs text-neutral-500 mt-0.5">{item.note}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Safety reminder */}
        <div className="mt-8 p-4 bg-accent-50 rounded-xl border border-accent-200">
          <p className="text-sm text-accent-800 text-center">
            <strong>Safety First:</strong> Always wear your life jacket, never float alone,
            and check current river conditions before heading out.{' '}
            <a href="/gauges" className="underline font-semibold">Check conditions now &rarr;</a>
          </p>
        </div>
      </section>
    </div>
  );
}
