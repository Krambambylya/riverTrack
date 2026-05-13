import * as Location from 'expo-location';

/**
 * На эмуляторе и в помещениях `Balanced`/`High` часто ждут GPS и не возвращают координаты.
 * Сначала запрашиваем «лёгкую» точность, затем последнюю известную позицию ОС, затем минимальную точность.
 */
export async function getReliableCurrentPositionAsync(): Promise<Location.LocationObject> {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
      mayShowUserSettingsDialog: true,
    });
  } catch {
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
  }
}
