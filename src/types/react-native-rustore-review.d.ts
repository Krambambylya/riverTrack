declare module 'react-native-rustore-review' {
  type RustoreReviewModule = {
    init: () => void;
    requestReviewFlow: () => Promise<boolean>;
    launchReviewFlow: () => Promise<boolean>;
  };

  const RustoreReview: RustoreReviewModule;
  export default RustoreReview;
}
