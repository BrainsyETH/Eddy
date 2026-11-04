import AsyncStorage from '@react-native-async-storage/async-storage';
import { createReminderPreferences } from './reminderPreferencesCore';

export const savedReminderPreferences = createReminderPreferences(AsyncStorage);
