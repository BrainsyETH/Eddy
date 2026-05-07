'use client';

// src/components/chat/ChatBubble.tsx
// Floating Eddy otter FAB that opens/closes the chat overlay.
// Shifts up when the float plan bottom sheet is visible on mobile.
// Desktop: supports compact (400x600) and fullscreen modes.

import { useState, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import Image from 'next/image';
import ChatPanel from './ChatPanel';
import { EDDY_IMAGES } from '@/constants';

/** Height of the collapsed float plan bottom sheet (matches FloatPlanCard) */
const BOTTOM_SHEET_COLLAPSED_HEIGHT = 65;

export default function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Extract river slug for chat context. Canonical home is /plan?river=<slug>;
  // /rivers/<slug>/access/<accessSlug> sub-routes still expose the slug in the path.
  const riverSlug =
    searchParams?.get('river') ||
    (pathname?.startsWith('/rivers/') ? pathname.split('/')[2] || undefined : undefined);

  // Detect the float plan bottom sheet by observing fixed elements at bottom
  useEffect(() => {
    const check = () => {
      const sheet = document.querySelector('.fixed.bottom-0.z-50.rounded-t-3xl');
      if (sheet) {
        setBottomSheetVisible(true);
        const height = sheet.getBoundingClientRect().height;
        setBottomSheetExpanded(height > 200);
      } else {
        setBottomSheetVisible(false);
        setBottomSheetExpanded(false);
      }
    };

    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    return () => observer.disconnect();
  }, [pathname]);

  // Reset fullscreen when closing
  const handleClose = () => {
    setIsOpen(false);
    setIsFullscreen(false);
  };

  // Don't show on the dedicated /chat page or embedded widget pages
  if (pathname === '/chat') return null;
  if (pathname?.startsWith('/embed/')) return null;

  // On the planner with a river loaded (split-panel layout) hide the FAB on desktop to avoid covering map controls.
  const isRiverPage = pathname === '/plan' && !!searchParams?.get('river');

  const hideFab = bottomSheetExpanded && !isOpen;
  const fabBottom = bottomSheetVisible && !bottomSheetExpanded
    ? BOTTOM_SHEET_COLLAPSED_HEIGHT + 16
    : 24;

  // Desktop panel classes: compact vs fullscreen
  const desktopPanelClass = isFullscreen
    ? 'lg:inset-4 lg:w-auto lg:h-auto lg:rounded-2xl'
    : 'lg:inset-auto lg:right-4 lg:bottom-4 lg:w-[400px] lg:h-[600px] lg:rounded-2xl';

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed right-4 z-[60] transition-all duration-300 ease-out group ${
            hideFab ? 'opacity-0 pointer-events-none scale-75' : 'opacity-100 scale-100'
          } ${isRiverPage ? 'lg:hidden' : ''}`}
          style={{ bottom: fabBottom }}
          aria-label="Ask Eddy"
        >
          <div className="flex flex-col items-center gap-1.5">
            <div className="relative w-14 h-14 rounded-full bg-primary-800 shadow-lg border-2 border-accent-400 flex items-center justify-center overflow-hidden group-hover:scale-110 group-hover:shadow-xl transition-all duration-200">
              <Image
                src={EDDY_IMAGES.favicon}
                alt="Ask Eddy"
                width={48}
                height={48}
                className="w-11 h-11 object-cover rounded-full"
              />
            </div>
            <span
              className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-accent-500 text-white shadow-sm whitespace-nowrap"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Ask Eddy
            </span>
          </div>
        </button>
      )}

      {/* Chat Overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 z-[70] ${isFullscreen ? 'bg-black/40' : 'bg-black/40 lg:bg-transparent lg:pointer-events-none'}`}
            onClick={handleClose}
          />

          {/* Chat panel container */}
          <div
            className={`fixed z-[80] inset-x-0 bottom-0 ${desktopPanelClass} lg:shadow-2xl lg:border-2 lg:border-primary-200 overflow-hidden animate-slide-up lg:animate-fade-in transition-all duration-300`}
            style={{ height: isFullscreen ? undefined : 'min(85vh, 700px)' }}
          >
            {/* Branded header */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary-800 border-b border-primary-700">
              <div className="flex items-center gap-2.5">
                <Image
                  src={EDDY_IMAGES.favicon}
                  alt="Eddy"
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-full border border-primary-600"
                />
                <div>
                  <h3
                    className="text-base font-semibold text-accent-400 leading-tight"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Eddy
                  </h3>
                  {riverSlug && (
                    <p className="text-[11px] text-primary-300 leading-tight">
                      {riverSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Fullscreen toggle — desktop only */}
                <button
                  onClick={() => setIsFullscreen(f => !f)}
                  className="hidden lg:flex w-8 h-8 rounded-lg items-center justify-center text-primary-300 hover:text-white hover:bg-primary-700 transition-colors"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-primary-300 hover:text-white hover:bg-primary-700 transition-colors"
                  aria-label="Close chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chat content */}
            <div className="h-[calc(100%-56px)]">
              <ChatPanel riverSlug={riverSlug} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
