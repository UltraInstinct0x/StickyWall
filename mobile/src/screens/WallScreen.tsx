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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

interface WallItem {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  content_type: string;
  created_at: string;
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

  const API_BASE = 'https://182e96e39f50.ngrok-free.app';

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

  const renderWallItem = (item: WallItem) => (
    <View key={item.id} style={styles.wallItem}>
      <Text style={styles.itemTitle}>{item.title || 'Shared Content'}</Text>
      {item.url && (
        <Text style={styles.itemUrl} numberOfLines={2}>
          {item.url}
        </Text>
      )}
      {item.text && (
        <Text style={styles.itemText} numberOfLines={3}>
          {item.text}
        </Text>
      )}
      <View style={styles.itemMeta}>
        <Text style={styles.itemType}>{item.content_type.toUpperCase()}</Text>
        <Text style={styles.itemDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );

  const renderWallList = () => (
    <View style={styles.wallList}>
      <Text style={styles.sectionTitle}>Your Walls</Text>
      {walls.map(wall => (
        <TouchableOpacity
          key={wall.id}
          style={[
            styles.wallListItem,
            selectedWall?.id === wall.id && styles.selectedWall,
          ]}
          onPress={() => setSelectedWall(wall)}
        >
          <Text style={styles.wallName}>{wall.name}</Text>
          <Text style={styles.wallItemCount}>{wall.items.length} items</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Digital Wall</Text>
      </View>

      {walls.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Walls Yet</Text>
          <Text style={styles.emptyText}>
            Start sharing content from other apps to create your first wall!
          </Text>
        </View>
      ) : (
        <View style={styles.content}>
          {renderWallList()}

          <View style={styles.wallContent}>
            {selectedWall && (
              <>
                <Text style={styles.wallTitle}>{selectedWall.name}</Text>
                <ScrollView
                  style={styles.itemsContainer}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                    />
                  }
                >
                  {selectedWall.items.length === 0 ? (
                    <Text style={styles.emptyWallText}>
                      No items in this wall yet
                    </Text>
                  ) : (
                    selectedWall.items.map(renderWallItem)
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#6366f1',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  wallList: {
    width: width * 0.35,
    backgroundColor: '#fff',
    paddingVertical: 20,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
    paddingHorizontal: 15,
    color: '#374151',
  },
  wallListItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginHorizontal: 10,
    borderRadius: 8,
    marginBottom: 5,
  },
  selectedWall: {
    backgroundColor: '#ede9fe',
  },
  wallName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
  },
  wallItemCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  wallContent: {
    flex: 1,
    paddingVertical: 20,
  },
  wallTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    paddingHorizontal: 20,
    color: '#374151',
  },
  itemsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  wallItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  itemUrl: {
    fontSize: 14,
    color: '#6366f1',
    marginBottom: 8,
  },
  itemText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  itemType: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6366f1',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyWallText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
  },
});
