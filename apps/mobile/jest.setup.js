/* global jest, require */
// Reanimated 4 Jest setup: worklets' own mock, then Reanimated's test helpers.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();
