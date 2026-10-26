'use client';

import Image from 'next/image';
import { useAppDevice } from './useAppDevice';

export default function AppQrPrompt({ href, src, className, frameClassName }: {
  href: string;
  src: string;
  className: string;
  frameClassName: string;
}) {
  const device = useAppDevice();
  if (device === 'ios') return null;
  return (
    <div className={className} data-app-qr>
      <a href={href} className={frameClassName} aria-label="Open Eddy’s download page for this dam">
        <Image src={src} alt="QR code for this dam in Eddy" width={124} height={124} unoptimized />
      </a>
      <span><strong>Scan with your iPhone</strong>Get Eddy from the App Store.</span>
    </div>
  );
}
