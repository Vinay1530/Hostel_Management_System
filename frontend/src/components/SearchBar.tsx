import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export function SearchBar({
  value = "",
  onChangeText,
  onPress,
  onSubmitEditing,
  editable = true,
  autoFocus = false,
  placeholder = "Search PGs, rooms, tenants",
}: {
  value?: string;
  onChangeText?: (value: string) => void;
  onPress?: () => void;
  onSubmitEditing?: () => void;
  editable?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <Pressable style={styles.container} onPress={onPress} disabled={editable}>
      <Ionicons name="search-outline" size={18} color={theme.textLight} />
      {editable ? (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={theme.textLight}
          autoFocus={autoFocus}
          returnKeyType="search"
          autoCapitalize="none"
        />
      ) : (
        <Text style={styles.placeholder}>{placeholder}</Text>
      )}
      {editable && value.length > 0 && (
        <Pressable
          accessibilityLabel="Clear search"
          hitSlop={8}
          onPress={() => onChangeText?.("")}
        >
          <Ionicons name="close-circle" size={19} color={theme.textLight} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 13,
    marginBottom: 14,
  },
  input: { flex: 1, color: theme.text, fontSize: 14, paddingVertical: 11 },
  placeholder: { flex: 1, color: theme.textLight, fontSize: 14 },
});
