// src/components/ui/BuildRouteIcon.tsx
// Eddy with a map: the Build a Route mark, shared with the iOS Floats hub
// (eddy-ios/assets/float-action-icons/build-route@3x.png). The artwork is an
// alpha template, so it is drawn as a mask in the surrounding text colour and
// follows each button's own ink, hover state and dark theme.

export default function BuildRouteIcon({ size = 24 }: { size?: number }) {
  const mask = 'url(/icons/eddy-build-route.png) center / contain no-repeat';
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 bg-current"
      style={{ width: size, height: size, mask, WebkitMask: mask }}
    />
  );
}
