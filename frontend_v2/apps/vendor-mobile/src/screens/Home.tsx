import { View, Text, ScrollView, StyleSheet } from 'react-native';

export function Home() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Total Orders</Text>
          <Text style={styles.cardValue}>0</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Products</Text>
          <Text style={styles.cardValue}>0</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Wallet balance</Text>
          <Text style={styles.cardValue}>₹0</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
  },
});

