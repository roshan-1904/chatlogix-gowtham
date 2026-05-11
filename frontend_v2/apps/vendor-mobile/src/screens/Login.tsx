import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export function Login() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ChatLogix Vendor</Text>
      <Text style={styles.subtitle}>Login to continue</Text>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Login (Placeholder)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f9fafb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

