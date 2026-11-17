'use client';

import Image from 'next/image';
import { useAppDevice } from './useAppDevice';

/** Desktop-only: the code opens the App Store, so an iPhone gets the download button instead. */
export default function AppQrPrompt({ href, src, size = 124, className, frameClassName }: {
  href: string;
  src: string;
  size?: number;
  className: string;
  frameClassName: string;
}) {
  const device = useAppDevice();
  if (device === 'ios') return null;
  return (
    <div className={className} data-app-qr>
      <a href={href} className={frameClassName} target="_blank" rel="noopener noreferrer" aria-label="Get Eddy on the App Store">
        <Image src={src} alt="QR code for Eddy on the App Store" width={size} height={size} unoptimized />
      </a>
      <span><strong>Scan with your iPhone</strong>Get Eddy from the App Store.</span>
    </div>
  );
}
