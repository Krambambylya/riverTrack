import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const RUSTORE_REVIEW_SHOWN_KEY = 'rivertrack.rustore-review-shown.v1';
const REVIEW_DELAY_MS = 2000;

let rustoreReviewInitDone = false;
let scheduleInFlight = false;

export async function tryScheduleRustoreReviewAfterFirstRouteBuilt(): Promise<void> {
  if (Platform.OS !== 'android' || scheduleInFlight) return;

  scheduleInFlight = true;
  try {
    const alreadyShown = await AsyncStorage.getItem(RUSTORE_REVIEW_SHOWN_KEY);
    if (alreadyShown === '1') return;

    await AsyncStorage.setItem(RUSTORE_REVIEW_SHOWN_KEY, '1');
  } catch {
    scheduleInFlight = false;
    return;
  }

  setTimeout(() => {
    void showRustoreReview();
  }, REVIEW_DELAY_MS);
}

async function showRustoreReview(): Promise<void> {
  try {
    const RustoreReview = (await import('react-native-rustore-review')).default;
    if (!RustoreReview?.init || !RustoreReview.requestReviewFlow || !RustoreReview.launchReviewFlow) {
      return;
    }

    if (!rustoreReviewInitDone) {
      RustoreReview.init();
      rustoreReviewInitDone = true;
    }

    const isRequested = await RustoreReview.requestReviewFlow();
    if (isRequested) {
      await RustoreReview.launchReviewFlow();
    }
  } catch (error) {
    console.log('[RiverTrack][RuStoreReview] не удалось показать оценку', error);
  }
}
