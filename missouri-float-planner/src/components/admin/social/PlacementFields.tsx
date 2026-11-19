import { STORY_PLATFORMS, type PlacementChoice, type PlacementChoices } from '@/lib/social/placements';

/** Reel/Story choice per Story-capable platform, for any format with per-destination layouts. */
export function PlacementFields({ formatLabel, value = {}, onChange, platforms = STORY_PLATFORMS }: {
  formatLabel: string;
  value?: PlacementChoices;
  onChange: (value: PlacementChoices) => void;
  platforms?: readonly string[];
}) {
  const selected = STORY_PLATFORMS.filter(platform => platforms.includes(platform));
  if (!selected.length) return null;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-white">{formatLabel} placement</legend>
      <div className="flex flex-wrap gap-3">
        {selected.map(platform => {
          const regular = platform === 'instagram' ? 'Reel' : 'Page video';
          return (
            <label key={platform} className="grid gap-1 text-xs text-neutral-300">
              {platform === 'instagram' ? 'Instagram' : 'Facebook'}
              <select value={value[platform] ?? 'regular'}
                onChange={event => onChange({ ...value, [platform]: event.target.value as PlacementChoice })}
                className="min-h-10 rounded-md border border-neutral-600 bg-neutral-900 px-2 text-sm text-white">
                <option value="regular">{regular} only</option>
                <option value="story">Story only</option>
                <option value="both">{regular} + Story</option>
              </select>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
