import * as Location from 'expo-location';

export async function getReliableCurrentPositionAsync(): Promise<Location.LocationObject> {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
      mayShowUserSettingsDialog: true,
    });
  } catch (primaryError) {
    console.log('[RiverTrack][Location] getCurrentPosition (Low) не удалась', primaryError);
    try {
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 10 * 60 * 1000,
        requiredAccuracy: 100_000,
      });
      if (lastKnown) {
        return lastKnown;
      }
      return await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
        mayShowUserSettingsDialog: true,
      });
    } catch (fallbackError) {
      console.log('[RiverTrack][Location] резервные способы геолокации не удались', fallbackError);
      throw fallbackError;
    }
  }
}
