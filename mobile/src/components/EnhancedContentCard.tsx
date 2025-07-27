import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { Colors, getContentTypeColor } from '../constants/Colors';
import { Typography } from '../constants/Typography';

interface WallItem {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  content_type: string;
  created_at: string;
  thumbnail_url?: string;
  description?: string;
  author_name?: string;
  provider_name?: string;
}

interface EnhancedContentCardProps {
  item: WallItem;
  onPress?: () => void;
}

export const EnhancedContentCard: React.FC<EnhancedContentCardProps> = ({
  item,
  onPress,
}) => {
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (item.url) {
      Linking.openURL(item.url).catch(() => {
        Alert.alert('Error', 'Unable to open link');
      });
    }
  };

  const getContentIcon = (contentType: string) => {
    switch (contentType.toLowerCase()) {
      case 'image':
        return '🖼️';
      case 'video':
        return '🎥';
      case 'article':
        return '📰';
      case 'link':
        return '🔗';
      case 'text':
        return '📝';
      case 'pdf':
        return '📄';
      default:
        return '📱';
    }
  };

  const getBackgroundColorForType = (contentType: string) => {
    return getContentTypeColor(contentType);
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.9}>
      {/* Content preview section */}
      <View style={styles.previewSection}>
        {item.thumbnail_url ? (
          <Image 
            source={{ uri: item.thumbnail_url }} 
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.placeholderThumbnail, { backgroundColor: getBackgroundColorForType(item.content_type) }]}>
            <Text style={styles.placeholderIcon}>{getContentIcon(item.content_type)}</Text>
            <Text style={styles.placeholderText}>{item.content_type.toUpperCase()}</Text>
          </View>
        )}
        
        {/* Content type overlay */}
        <View style={styles.typeOverlay}>
          <Text style={styles.typeText}>{item.content_type.toUpperCase()}</Text>
        </View>
      </View>

      {/* Content details */}
      <View style={styles.contentSection}>
        {/* Header with provider info */}
        {item.provider_name && (
          <View style={styles.providerSection}>
            <Text style={styles.providerText}>{item.provider_name}</Text>
            <View style={styles.providerDot} />
            <Text style={styles.timeText}>
              {new Date(item.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          </View>
        )}

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {item.title || 'Shared Content'}
        </Text>

        {/* Description or text content */}
        {item.description && (
          <Text style={styles.description} numberOfLines={3}>
            {item.description}
          </Text>
        )}
        
        {item.text && !item.description && (
          <Text style={styles.textContent} numberOfLines={3}>
            {item.text}
          </Text>
        )}

        {/* URL preview */}
        {item.url && (
          <Text style={styles.url} numberOfLines={1}>
            {item.url.replace(/^https?:\/\//, '')}
          </Text>
        )}

        {/* Footer with author and engagement */}
        <View style={styles.footer}>
          {item.author_name && (
            <Text style={styles.author}>by {item.author_name}</Text>
          )}
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionText}>View</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    marginBottom: 24,
    shadowColor: Colors.shadowPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  
  // Preview section
  previewSection: {
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: 240,
    backgroundColor: Colors.gray50,
  },
  placeholderThumbnail: {
    width: '100%',
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  placeholderText: {
    ...Typography.titleMedium,
    color: Colors.surface,
  },
  typeOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeText: {
    ...Typography.labelSmall,
    color: Colors.surface,
  },
  
  // Content section
  contentSection: {
    padding: 24,
  },
  providerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  providerText: {
    ...Typography.labelLarge,
    color: Colors.textTertiary,
  },
  providerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    marginHorizontal: 8,
  },
  timeText: {
    ...Typography.labelLarge,
    color: Colors.textMuted,
  },
  title: {
    ...Typography.headlineMedium,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  description: {
    ...Typography.bodyLarge,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  textContent: {
    ...Typography.bodyLarge,
    color: Colors.textSecondary,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  url: {
    ...Typography.bodyMedium,
    color: Colors.primary,
    marginBottom: 16,
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  author: {
    ...Typography.labelLarge,
    color: Colors.textTertiary,
    flex: 1,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    ...Typography.buttonMedium,
    color: Colors.surface,
  },
});