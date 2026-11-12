import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { DAM_SCHEDULE_IMAGE_SIZE, type DamScheduleShare } from '@shared/dam-schedule-share';
import { loadOgFonts } from './fonts';
import { DamScheduleImage } from './dam-schedule-image';

async function assets() {
  const [damIcon, otter, font] = await Promise.all([
    readFile(join(process.cwd(), 'public/icons/eddy-dam.png')),
    readFile(join(process.cwd(), 'public/share/otter-standard.png')),
    readFile(join(process.cwd(), 'public/fonts/Geist-Regular.ttf')),
  ]);
  return {
    damIcon: `data:image/png;base64,${damIcon.toString('base64')}`,
    otter: `data:image/png;base64,${otter.toString('base64')}`,
    font: new Uint8Array(font).buffer,
  };
}

/** Consume the stream before returning headers, so failed renders cannot be cached. */
export async function renderDamSchedule(model: DamScheduleShare) {
  const { font, ...images } = await assets();
  const image = new ImageResponse(<DamScheduleImage model={model} {...images} />, {
    ...DAM_SCHEDULE_IMAGE_SIZE,
    fonts: [...loadOgFonts(), { name: 'Geist', data: font, weight: 400, style: 'normal' }],
  });
  return image.arrayBuffer();
}
