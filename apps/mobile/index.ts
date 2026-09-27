// The app's entry: the background upload task is defined before the router starts, so a launch that
// only runs the task (no screens) finds it.
import './src/composition/background';
import 'expo-router/entry';
