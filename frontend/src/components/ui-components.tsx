import { theme } from "@/lib/theme";
import { design } from "@/lib/design";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export type DesignTokens = typeof design;

// ---------- Base Components ----------

export function AppText({
  children,
  variant = "body",
  color = design.colors.textPrimary,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
}: {
  children: React.ReactNode;
  variant?: keyof typeof design.typography;
  color?: string;
  style?: any;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
}) {
  const base = design.typography[variant as keyof typeof design.typography];
  return (
    <Text
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      style={[base, { color }, style]}
    >
      {children}
    </Text>
  );
}

// ---------- Button ----------

export function AppButton({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  onPress,
  icon,
  iconPosition = "left",
  style,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onPress?: () => void;
  icon?: string;
  iconPosition?: "left" | "right";
  style?: any;
}) {
  const variants: Record<string, { bg: string; color: string; border: string }> = {
    primary: { bg: design.colors.primary, color: "#fff", border: "transparent" },
    secondary: { bg: design.colors.secondary, color: "#fff", border: "transparent" },
    outline: { bg: "transparent", color: design.colors.primary, border: design.colors.primary },
    ghost: { bg: "transparent", color: design.colors.textSecondary, border: "transparent" },
    danger: { bg: design.colors.danger, color: "#fff", border: "transparent" },
  };
  const sizes: Record<string, { py: number; fontSize: number }> = {
    sm: { py: 8, fontSize: 13 },
    md: { py: 12, fontSize: 15 },
    lg: { py: 16, fontSize: 17 },
  };
  const v = variants[variant];
  const s = sizes[size];

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        fullWidth && styles.btnFull,
        {
          backgroundColor: disabled ? design.colors.surfaceVariant : v.bg,
          borderWidth: v.border !== "transparent" ? 1 : 0,
          borderColor: v.border,
          paddingVertical: s.py,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" style={{ marginRight: iconPosition === "left" ? 6 : 0 }} />
      ) : icon && iconPosition === "left" ? (
        <Ionicons name={icon as any} size={18} color={v.color} style={{ marginRight: 6 }} />
      ) : null}
      <AppText variant="button" color={v.color}>{children}</AppText>
      {loading ? (
        <ActivityIndicator size="small" color="#fff" style={{ marginLeft: iconPosition === "right" ? 6 : 0 }} />
      ) : icon && iconPosition === "right" ? (
        <Ionicons name={icon as any} size={18} color={v.color} style={{ marginLeft: 6 }} />
      ) : null}
    </TouchableOpacity>
  );
}

// ---------- Card ----------

export function AppCard({ children, elevated = true, padding = design.spacing.md, style }: { children?: React.ReactNode; elevated?: boolean; padding?: number; style?: any }) {
  const shadow = getShadow(elevated ? "md" : "sm");
  return (
    <View style={[styles.card, { padding }, shadow, style]}>{children}</View>
  );
}

// ---------- Input ----------

export function AppInput({
  value,
  onChangeText,
  placeholder,
  label,
  error,
  secureTextEntry = false,
  keyboardType,
  multiline = false,
  numberOfLines = 1,
  leftIcon,
  rightIcon,
  style,
  ...props
}: {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  multiline?: boolean;
  numberOfLines?: number;
  leftIcon?: string;
  rightIcon?: string;
  style?: any;
  [key: string]: any;
}) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={styles.inputContainer}>
      {label && <AppText variant="label" color={focused ? design.colors.primary : design.colors.textSecondary}>{label}</AppText>}
      <View style={[styles.inputWrapper, focused && styles.inputWrapperFocused, error && styles.inputWrapperError]}>
        {leftIcon && <Ionicons name={leftIcon as any} size={18} color={focused ? design.colors.primary : design.colors.textMuted} style={styles.inputIcon} />}
        <TextInput
          style={[styles.input, style]}
          value={value ?? ""}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={design.colors.textMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {rightIcon && <Ionicons name={rightIcon as any} size={18} color={design.colors.textMuted} style={styles.inputIcon} />}
      </View>
      {error && <AppText variant="caption" color={design.colors.danger}>{error}</AppText>}
    </View>
  );
}

// ---------- Badge ----------

export function AppBadge({ children, variant = "primary", style }: { children?: React.ReactNode; variant?: "primary" | "success" | "warning" | "danger" | "info" | "neutral"; style?: any }) {
  const colors: Record<string, { bg: string; color: string }> = {
    primary: { bg: design.colors.primaryLight, color: design.colors.primaryDark },
    success: { bg: design.colors.successLight, color: design.colors.success },
    warning: { bg: design.colors.warningLight, color: "#92400e" },
    danger: { bg: design.colors.dangerLight, color: design.colors.danger },
    info: { bg: design.colors.infoLight, color: design.colors.info },
    neutral: { bg: design.colors.surfaceVariant, color: design.colors.textSecondary },
  };
  const c = colors[variant];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, style]}>
      <AppText variant="caption" color={c.color}>{children}</AppText>
    </View>
  );
}

// ---------- Avatar ----------

export function AppAvatar({ src, initials, size = 40, variant = "neutral" }: { src?: ImageSourcePropType; initials?: string; size?: number; variant?: "neutral" | "primary" | "success" | "warning" | "danger" }) {
  const colors: Record<string, string> = {
    neutral: "#94a3b8",
    primary: design.colors.primary,
    success: design.colors.success,
    warning: design.colors.warning,
    danger: design.colors.danger,
  };
  const hasImage = !!src;
  return (
    <View style={[styles.avatar, { width: size, height: size, backgroundColor: colors[variant] }]}>
      {hasImage ? (
        <Image source={src} style={styles.avatarImage} resizeMode="cover" />
      ) : initials ? (
        <AppText variant="h4" color="#fff">{initials}</AppText>
      ) : (
        <Ionicons name="person" size={size * 0.4} color="#fff" />
      )}
    </View>
  );
}

// ---------- Stat Card ----------

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  variant = "primary",
  trend,
  compact = false,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  variant?: "primary" | "success" | "warning" | "danger" | "info";
  trend?: { label: string; up: boolean };
  /** Smaller layout for narrow two-column cells (keeps currency values on one line). */
  compact?: boolean;
}) {
  const colors: Record<string, { bg: string; icon: string }> = {
    primary: { bg: design.colors.primaryLight, icon: design.colors.primary },
    success: { bg: design.colors.successLight, icon: design.colors.success },
    warning: { bg: design.colors.warningLight, icon: "#92400e" },
    danger: { bg: design.colors.dangerLight, icon: design.colors.danger },
    info: { bg: design.colors.infoLight, icon: design.colors.info },
  };
  const c = colors[variant];

  return (
    <View style={[styles.statCard, { backgroundColor: c.bg }]}>
      <View style={[styles.statIcon, compact && styles.statIconCompact]}>
        <Ionicons name={icon as any} size={compact ? 16 : 20} color={c.icon} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="caption" color={design.colors.textMuted}>{title}</AppText>
        <AppText
          variant={compact ? "h4" : "h3"}
          color={design.colors.textPrimary}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </AppText>
        {subtitle && <AppText variant="caption" color={design.colors.textSecondary}>{subtitle}</AppText>}
      </View>
      {trend && (
        <View style={styles.trendBadge}>
          <Ionicons name={trend.up ? "trending-up" : "trending-down"} size={12} color={trend.up ? design.colors.success : design.colors.danger} />
          <AppText variant="caption" color={trend.up ? design.colors.success : design.colors.danger}>{trend.label}</AppText>
        </View>
      )}
    </View>
  );
}

// ---------- Skeleton ----------

export function Skeleton({
  width = "100%",
  height = 14,
  radius = design.radius.sm,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: any;
}) {
  const opacity = React.useRef(new Animated.Value(0.55)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: design.colors.surfaceVariant, opacity },
        style,
      ]}
    />
  );
}

// ---------- Empty State ----------

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon as any} size={30} color={design.colors.primary} />
      </View>
      <AppText variant="h4" color={design.colors.textPrimary} style={styles.emptyTitle}>
        {title}
      </AppText>
      <AppText variant="body" color={design.colors.textSecondary} style={styles.emptySubtitle}>
        {subtitle}
      </AppText>
      {actionLabel && onAction && (
        <AppButton variant="primary" onPress={onAction} fullWidth style={styles.emptyAction}>
          {actionLabel}
        </AppButton>
      )}
    </View>
  );
}

// ---------- Section Header ----------

export function SectionHeader({ title, subtitle, actionLabel, onAction }: { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <AppText variant="h4" color={design.colors.textPrimary}>{title}</AppText>
        {subtitle && <AppText variant="caption" color={design.colors.textMuted}>{subtitle}</AppText>}
      </View>
      {actionLabel && onAction && (
        <AppButton variant="ghost" size="sm" onPress={onAction}>
          {actionLabel}
        </AppButton>
      )}
    </View>
  );
}

// ---------- List Item ----------

export function ListItem({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  disabled,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.listItem, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
    >
      {leading && <View style={styles.listLeading}>{leading}</View>}
      <View style={styles.listBody}>
        <AppText variant="body" color={design.colors.textPrimary}>{title}</AppText>
        {subtitle && <AppText variant="caption" color={design.colors.textSecondary}>{subtitle}</AppText>}
      </View>
      {trailing && <View style={styles.listTrailing}>{trailing}</View>}
    </TouchableOpacity>
  );
}

// ---------- Progress Ring (pure RN, no SVG dependency) ----------

export function ProgressRing({ percent, size = 100, strokeWidth = 8, color = design.colors.primary }: { percent: number; size?: number; strokeWidth?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <View
      style={[
        styles.progressContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: design.colors.border,
        },
      ]}
    >
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: `${pct}%` as any,
          backgroundColor: `${color}22` as any,
          borderBottomLeftRadius: size - strokeWidth,
          borderBottomRightRadius: size - strokeWidth,
          overflow: "hidden",
        }}
      />
      <AppText variant="h3" color={design.colors.textPrimary}>
        {pct}%
      </AppText>
    </View>
  );
}

function getShadow(level: "sm" | "md" | "lg" | "xlg" = "md") {
  const map: Record<string, any> = {
    sm: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    md: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
    lg: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6 },
    xlg: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 10 },
  };
  return map[level];
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: design.radius.lg,
    minHeight: 44,
    gap: 8,
  },
  btnFull: { width: "100%" },
  card: {
    backgroundColor: design.colors.surface,
    borderRadius: design.radius.lg,
    borderWidth: 1,
    borderColor: design.colors.border,
  },
  inputContainer: { gap: 6 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: design.colors.surface,
    borderWidth: 1,
    borderColor: design.colors.border,
    borderRadius: design.radius.lg,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  inputWrapperFocused: { borderColor: design.colors.borderFocus },
  inputWrapperError: { borderColor: design.colors.danger },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: design.colors.textPrimary, fontSize: 15 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: design.radius.sm,
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  statCard: {
    backgroundColor: design.colors.surface,
    borderRadius: design.radius.lg,
    padding: design.spacing.md,
    borderWidth: 1,
    borderColor: design.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  statIconCompact: {
    width: 28,
    height: 28,
    borderRadius: 9,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: design.radius.full,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  emptyContainer: { alignItems: "center", justifyContent: "center", padding: design.spacing.xl },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { marginBottom: 8, textAlign: "center" },
  emptySubtitle: { textAlign: "center", marginBottom: 20, maxWidth: 260 },
  emptyAction: { width: 200, marginTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: design.spacing.md,
    borderRadius: design.radius.lg,
    backgroundColor: design.colors.surface,
    borderWidth: 1,
    borderColor: design.colors.border,
  },
  listLeading: { marginRight: 12 },
  listBody: { flex: 1 },
  listTrailing: { marginLeft: 12 },
  progressContainer: { alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" },
});