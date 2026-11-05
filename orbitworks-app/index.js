import { registerRootComponent } from 'expo';
import { getEnvironmentVerdict } from './lib/envGuard';

// Environment gate (config/envRules.js). App.js - and with it Firebase,
// Sentry and every screen - is only loaded when this build is pointed at
// the right Firebase project. Otherwise a blocking screen is all that runs.
const verdict = getEnvironmentVerdict();

if (verdict.ok) {
  // Phase 8: the leave tracking region task must be defined before anything
  // else, also when the OS starts the app in the background for it.
  require('./lib/siteFenceTask');
  const App = require('./App').default;
  // registerRootComponent calls AppRegistry.registerComponent('main', () => App);
  // It also ensures that whether you load the app in Expo Go or in a native build,
  // the environment is set up appropriately
  registerRootComponent(App);
} else {
  const WrongEnvironmentScreen = require('./screens/WrongEnvironmentScreen').default;
  registerRootComponent(function WrongEnvironment() {
    return <WrongEnvironmentScreen reason={verdict.reason} />;
  });
}
