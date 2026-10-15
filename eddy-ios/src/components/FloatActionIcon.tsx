import { Image, type ColorValue } from 'react-native';

const icons = {
  startFloat: require('../../assets/float-action-icons/start-float.png'),
  buildRoute: require('../../assets/float-action-icons/build-route.png'),
  findRoute: require('../../assets/float-action-icons/find-route.png'),
} as const;

/** Alpha templates: the caller supplies the foreground for its themed surface. */
export function FloatActionIcon({
  name,
  color,
  size = 40,
}: {
  name: keyof typeof icons;
  color: ColorValue;
  size?: number;
}) {
  return (
    <Image
      source={icons[name]}
      style={{ width: size, height: size, tintColor: color, flexShrink: 0 }}
      resizeMode="contain"
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
