import React from 'react';
import { AppRegistry } from 'react-native';
import ShareExtension from './src/screens/ShareExtension';

const Share = () => {
  return <ShareExtension />;
};

AppRegistry.registerComponent('DigitalWallShare', () => Share);
