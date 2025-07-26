/**
 * Digital Wall Mobile App
 * Native sharing integration with Digital Wall backend
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { WallScreen } from './src/screens/WallScreen';
import ShareService from './src/services/ShareService';

function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize share service
    ShareService.startListening((shareData) => {
      Alert.alert(
        'Content Shared!', 
        `${shareData.title || shareData.text || shareData.url || 'New content'} has been added to your wall.`,
        [{ text: 'OK' }]
      );
    });

    setIsReady(true);

    return () => {
      ShareService.stopListening();
    };
  }, []);

  if (!isReady) {
    return null; // Could add a loading screen here
  }

  return <WallScreen />;
}

export default App;
