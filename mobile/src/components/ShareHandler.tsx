import React, { useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';

import React, { useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import Config from 'react-native-config';

const { RNShare } = NativeModules;

const ShareHandler = () => {
  useEffect(() => {
    const eventEmitter = new NativeEventEmitter(RNShare);
    const subscription = eventEmitter.addListener('ShareDataReceived', (data) => {
      const formData = new FormData();
      if (data.url) {
        formData.append('url', data.url);
      }
      if (data.text) {
        formData.append('text', data.text);
      }
      // Note: Image handling is a placeholder.
      // In a real app, you would handle the image data (e.g., base64)
      // and upload it as a file.
      if (data.image) {
        formData.append('text', `Image received: ${data.image}`);
      }

      fetch(`${Config.API_URL}/api/share`, {
        method: 'POST',
        body: formData,
      });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
};

export default ShareHandler;


export default ShareHandler;
