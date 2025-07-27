import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
  RefreshControl,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedContentCard } from '../components/EnhancedContentCard';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { ENV_CONFIG } from '../config/environment';

const { width } = Dimensions.get('window');

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

interface Wall {
  id: number;
  name: string;
  description?: string;
  items: WallItem[];
  created_at: string;
}

export const WallScreen: React.FC = () => {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [selectedWall, setSelectedWall] = useState<Wall | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showWallSelector, setShowWallSelector] = useState(false);

  const API_BASE = ENV_CONFIG.API_BASE_URL;

  const fetchWalls = async () => {
    try {
      setLoading(true);
      const userId = await AsyncStorage.getItem('userId');
      const response = await fetch(
        `${API_BASE}/api/walls${userId ? `?user_id=${userId}` : ''}`,
      );

      if (response.ok) {
        const data = await response.json();
        setWalls(data);
        if (data.length > 0 && !selectedWall) {
          setSelectedWall(data[0]);
        }
      } else {
        Alert.alert('Error', 'Failed to fetch walls');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error occurred');
      console.error('Fetch walls error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchWalls();
  }, []);

  useEffect(() => {
    fetchWalls();
  }, []);

  const renderWallItem = ({ item }: { item: WallItem }) => (
    <EnhancedContentCard item={item} />
  );

  const renderWallSelector = () => (
    <Modal 
      visible={showWallSelector} 
      animationType="slide" 
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Select Wall</Text>
          <TouchableOpacity 
            onPress={() => setShowWallSelector(false)}
            style={styles.modalCloseButton}
          >
            <Text style={styles.modalCloseText}>Done</Text>
          </TouchableOpacity>
        </View>
        
        <FlatList
          data={walls}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item: wall }) => (
            <TouchableOpacity
              style={[
                styles.wallSelectorItem,
                selectedWall?.id === wall.id && styles.selectedWallItem,
              ]}
              onPress={() => {
                setSelectedWall(wall);
                setShowWallSelector(false);
              }}
            >
              <View style={styles.wallSelectorContent}>
                <Text style={styles.wallSelectorName}>{wall.name}</Text>
                {wall.description && (
                  <Text style={styles.wallSelectorDescription}>{wall.description}</Text>
                )}
                <Text style={styles.wallSelectorCount}>
                  {wall.items.length} items
                </Text>
              </View>
              {selectedWall?.id === wall.id && (
                <View style={styles.selectedIndicator} />
              )}
            </TouchableOpacity>
          )}
          style={styles.wallSelectorList}
        />
      </SafeAreaView>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      
      {/* Header with wall selector */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Digital Wall</Text>
          {walls.length > 0 && selectedWall && (
            <TouchableOpacity
              style={styles.wallButton}
              onPress={() => setShowWallSelector(true)}
            >
              <Text style={styles.wallButtonText}>{selectedWall.name}</Text>
              <Text style={styles.wallButtonIcon}>▼</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {walls.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIllustration}>
            <Text style={styles.emptyIcon}>📋</Text>
          </View>
          <Text style={styles.emptyTitle}>Welcome to Digital Wall!</Text>
          <Text style={styles.emptyText}>
            Start sharing content from other apps to create your first wall. 
            Photos, links, articles, and more will appear here.
          </Text>
          <View style={styles.emptySteps}>
            <Text style={styles.emptyStep}>1. Open any app with content</Text>
            <Text style={styles.emptyStep}>2. Tap the share button</Text>
            <Text style={styles.emptyStep}>3. Select "Digital Wall"</Text>
          </View>
        </View>
      ) : (
        <View style={styles.content}>
          {selectedWall && selectedWall.items.length === 0 ? (
            <View style={styles.emptyWallState}>
              <View style={styles.emptyIllustration}>
                <Text style={styles.emptyIcon}>📱</Text>
              </View>
              <Text style={styles.emptyWallTitle}>
                {selectedWall.name} is empty
              </Text>
              <Text style={styles.emptyWallText}>
                Share content from other apps to start building your wall!
              </Text>
            </View>
          ) : (
            selectedWall && (
              <FlatList
                data={selectedWall.items}
                renderItem={renderWallItem}
                keyExtractor={(item) => item.id.toString()}
                style={styles.itemsList}
                contentContainerStyle={styles.itemsContainer}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={Colors.primary}
                    colors={[Colors.primary]}
                  />
                }
                showsVerticalScrollIndicator={false}
              />
            )
          )}
        </View>
      )}
      
      {renderWallSelector()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Main container
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  
  // Header styles
  header: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: Colors.shadowPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.displaySmall,
    color: Colors.surface,
  },
  
  // Wall selector button in header
  wallButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44, // iOS minimum touch target
  },
  wallButtonText: {
    ...Typography.titleMedium,
    color: Colors.surface,
    marginRight: 6,
  },
  wallButtonIcon: {
    ...Typography.labelSmall,
    color: Colors.surface,
  },
  
  // Content area
  content: {
    flex: 1,
  },
  
  // FlatList styles
  itemsList: {
    flex: 1,
  },
  itemsContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  
  
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray50,
  },
  modalTitle: {
    ...Typography.headlineLarge,
    color: Colors.textPrimary,
  },
  modalCloseButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    ...Typography.titleMedium,
    color: Colors.primary,
  },
  wallSelectorList: {
    flex: 1,
  },
  wallSelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray50,
    minHeight: 80, // Large touch target
  },
  selectedWallItem: {
    backgroundColor: Colors.backgroundSecondary,
  },
  wallSelectorContent: {
    flex: 1,
  },
  wallSelectorName: {
    ...Typography.titleLarge,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  wallSelectorDescription: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  wallSelectorCount: {
    ...Typography.labelMedium,
    color: Colors.textTertiary,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  
  // Enhanced empty states
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyWallState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIllustration: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    ...Typography.headlineLarge,
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyWallTitle: {
    ...Typography.headlineMedium,
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    ...Typography.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyWallText: {
    ...Typography.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptySteps: {
    alignItems: 'flex-start',
  },
  emptyStep: {
    ...Typography.titleMedium,
    color: Colors.textTertiary,
    marginBottom: 8,
  },
});
