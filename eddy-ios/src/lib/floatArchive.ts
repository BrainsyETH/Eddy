import AsyncStorage from '@react-native-async-storage/async-storage';
import { createFloatArchive } from './floatArchiveCore';

// No native IO on import. The foreground provider or end journal loads lazily.
export const floatArchive = createFloatArchive(AsyncStorage);
