import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPickupContactStore } from './pickupContactCore';

export const pickupContact = createPickupContactStore(AsyncStorage);
