import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPickupContactStore } from '@/lib/pickupContactCore';

export const pickupContact = createPickupContactStore(AsyncStorage);
