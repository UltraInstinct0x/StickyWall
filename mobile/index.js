/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import ShareHandler from './src/components/ShareHandler';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerComponent('DigitalWallShare', () => ShareHandler);
