import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePg } from "@/lib/pg";
import { design, getShadow } from "@/lib/design";
import { ConfirmDialog, Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppButton,
  AppText,
  AppBadge,
  AppAvatar,
  AppInput,
  SectionHeader,
} from "@/components/ui-components";

type ProfileData = {
  full_name: string;
  phone: string;
  email?: string | null;
  avatar_url?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  id_number?: string | null;
  notes?: string | null;
};

export default function Profile() {
  const { role, orgs, logout } = useAuth();
  const { properties, propertyId, property, setPropertyId } = usePg();
  const router = useRouter();

  const [confirmOut, setConfirmOut] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [buildingSheetOpen, setBuildingSheetOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);

  const [profileData, setProfileData] = useState<ProfileData>({ full_name: "", phone: "" });
  const [loading, setLoading] = useState(true);

  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    id_number: "",
    notes: "",
  });
  const [editFormError, setEditFormError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwForm, setPwForm] = useState({ current: "", new: "", confirm: "" });
  const [pwFormError, setPwFormError] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailDevCode, setEmailDevCode] = useState("");
  const [emailOtpError, setEmailOtpError] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const [phoneOpen, setPhoneOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneDevCode, setPhoneDevCode] = useState("");
  const [phoneOtpError, setPhoneOtpError] = useState("");
  const [sendingPhoneOtp, setSendingPhoneOtp] = useState(false);
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);

  const [savingAvatar, setSavingAvatar] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<ProfileData>("/my/profile");
      setProfileData(data);
      setEditForm({
        full_name: data.full_name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        emergency_contact_name: data.emergency_contact_name ?? "",
        emergency_contact_phone: data.emergency_contact_phone ?? "",
        id_number: data.id_number ?? "",
        notes: data.notes ?? "",
      });
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const saveProfile = async () => {
    setEditFormError("");
    if (!editForm.full_name.trim()) {
      setEditFormError("Full name is required.");
      return;
    }
    try {
      setSavingProfile(true);
      await api.patch("/my/profile", {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim() || null,
        emergency_contact_name: editForm.emergency_contact_name.trim() || null,
        emergency_contact_phone: editForm.emergency_contact_phone.trim() || null,
        id_number: editForm.id_number.trim() || null,
        notes: editForm.notes.trim() || null,
      });
      setEditOpen(false);
      await loadProfile();
      Alert.alert("Profile updated", "Your changes have been saved.");
    } catch (e: any) {
      setEditFormError(e.message ?? "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const sendEmailOtp = async () => {
    setEmailOtpError("");
    const trimmed = newEmail.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setEmailOtpError("Enter a valid email address.");
      return;
    }
    if (trimmed === (profileData.email ?? "").trim().toLowerCase()) {
      setEmailOtpError("New email must be different from your current email.");
      return;
    }
    try {
      setSendingOtp(true);
      const res = await api.post<{ email: string; dev_code: string | null }>("/my/email/otp/request", {
        email: trimmed,
      });
      setEmailDevCode(res.dev_code ?? "");
      setOtpSent(true);
    } catch (e: any) {
      setEmailOtpError(e.message ?? "Failed to send OTP.");
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyEmailOtp = async () => {
    setEmailOtpError("");
    if (!emailOtp.trim()) {
      setEmailOtpError("Enter the 6-digit OTP.");
      return;
    }
    try {
      setVerifyingEmail(true);
      await api.post("/my/email/otp/verify", {
        email: newEmail.trim().toLowerCase(),
        code: emailOtp.trim(),
      });
      setEmailOpen(false);
      setNewEmail("");
      setEmailOtp("");
      setEmailDevCode("");
      setOtpSent(false);
      await loadProfile();
      Alert.alert("Email verified", "Email verified and updated.");
    } catch (e: any) {
      setEmailOtpError(e.message ?? "Failed to verify OTP.");
    } finally {
      setVerifyingEmail(false);
    }
  };

  const sendPhoneOtp = async () => {
    setPhoneOtpError("");
    const trimmed = newPhone.replace(/\D/g, "");
    if (!/^\d{10,15}$/.test(trimmed)) {
      setPhoneOtpError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (trimmed === profileData.phone) {
      setPhoneOtpError("New number must be different from your current number.");
      return;
    }
    try {
      setSendingPhoneOtp(true);
      const res = await api.post<{ phone: string; dev_code: string | null }>(
        "/my/phone/otp/request",
        { new_phone: trimmed }
      );
      setPhoneDevCode(res.dev_code ?? "");
      setPhoneOtpSent(true);
    } catch (e: any) {
      setPhoneOtpError(e.message ?? "Failed to send OTP.");
    } finally {
      setSendingPhoneOtp(false);
    }
  };

  const verifyPhoneOtp = async () => {
    setPhoneOtpError("");
    if (!phoneOtp.trim()) {
      setPhoneOtpError("Enter the 6-digit OTP.");
      return;
    }
    try {
      setVerifyingPhone(true);
      await api.post("/my/phone/otp/verify", {
        new_phone: newPhone.replace(/\D/g, ""),
        code: phoneOtp.trim(),
      });
      setPhoneOpen(false);
      setNewPhone("");
      setPhoneOtp("");
      setPhoneDevCode("");
      setPhoneOtpSent(false);
      await loadProfile();
      Alert.alert(
        "Mobile number updated",
        "Use your new number and existing password the next time you sign in."
      );
    } catch (e: any) {
      setPhoneOtpError(e.message ?? "Failed to verify OTP.");
    } finally {
      setVerifyingPhone(false);
    }
  };

  const changePassword = async () => {
    setPwFormError("");
    if (!pwForm.current || !pwForm.new || !pwForm.confirm) {
      setPwFormError("All fields are required.");
      return;
    }
    if (pwForm.new !== pwForm.confirm) {
      setPwFormError("Passwords do not match.");
      return;
    }
    if (pwForm.new.length < 6) {
      setPwFormError("New password must be at least 6 characters.");
      return;
    }
    try {
      setChangingPw(true);
      await api.post("/my/change-password", {
        current_password: pwForm.current,
        new_password: pwForm.new,
      });
      setPasswordOpen(false);
      setPwForm({ current: "", new: "", confirm: "" });
      Alert.alert("Password updated", "Your password has been changed successfully.");
    } catch (e: any) {
      setPwFormError(e.message ?? "Failed to change password.");
    } finally {
      setChangingPw(false);
    }
  };

  async function pickAvatar(source: "camera" | "library") {
    try {
      setSavingAvatar(true);
      const ImagePicker = await import("expo-image-picker");
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.8,
            });
      if (!result.canceled && result.assets?.length) {
        await api.patch("/my/avatar", { avatar_url: result.assets[0].uri });
        await loadProfile();
        Alert.alert("Avatar updated", "Profile picture updated successfully.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to update photo.");
    } finally {
      setSavingAvatar(false);
    }
  }

  function comingSoon(feature: string) {
    Alert.alert(feature, "This feature is coming soon.");
  }

  const orgName = orgs?.[0]?.name ?? "PG Manager";
  const initials = (profileData.full_name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (loading && !profileData.full_name) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <AppText color={design.colors.textSecondary}>Loading profile…</AppText>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={loadProfile} tintColor={design.colors.primary} />}
    >
      {/* Profile hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlowA} />
        <View style={styles.heroGlowB} />
        <View style={styles.heroTopRow}>
          <AppText variant="label" color="rgba(255,255,255,0.75)" style={styles.heroEyebrow}>
            STAFF PROFILE
          </AppText>
          <TouchableOpacity style={styles.heroIconBtn} onPress={() => router.push("/notifications")}>
            <Ionicons name="notifications-outline" size={19} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.avatarWrap}>
          <AppAvatar
            initials={initials}
            size={86}
            variant="primary"
            src={profileData.avatar_url ? { uri: profileData.avatar_url } : undefined}
          />
          <TouchableOpacity style={styles.cameraBadge} onPress={() => setAvatarOpen(true)}>
            <Ionicons name="camera" size={15} color={design.colors.primary} />
          </TouchableOpacity>
        </View>

        <AppText variant="h2" color="#fff" style={{ textAlign: "center" }}>
          {profileData.full_name || "User"}
        </AppText>
        <View style={styles.rolePill}>
          <Ionicons name="shield-checkmark" size={11} color="#fff" />
          <Text style={styles.rolePillText}>{role === "owner" ? "OWNER" : "MANAGER"}</Text>
        </View>
        <AppText variant="caption" color="rgba(255,255,255,0.78)" style={{ textAlign: "center", marginTop: 6 }}>
          {profileData.phone} · {orgName}
        </AppText>

        <TouchableOpacity style={styles.editProfileBtn} onPress={() => setEditOpen(true)} activeOpacity={0.9}>
          <Ionicons name="create-outline" size={15} color={design.colors.primary} />
          <Text style={styles.editProfileText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Account */}
      <SectionHeader title="Account" subtitle="Your sign-in identity and security" />
      <View style={styles.cardGroup}>
        <SettingsRow
          icon="mail-outline"
          iconBg={design.colors.primaryLight}
          iconColor={design.colors.primary}
          title="Email address"
          subtitle={profileData.email || "Not added yet"}
          trailing={
            <AppBadge variant={profileData.email ? "success" : "warning"}>
              {profileData.email ? "Verified" : "Add email"}
            </AppBadge>
          }
          onPress={() => {
            setEmailOtpError("");
            setOtpSent(false);
            setNewEmail("");
            setEmailOtp("");
            setEmailOpen(true);
          }}
        />
        <SettingsRow
          icon="lock-closed-outline"
          iconBg={design.colors.warningLight}
          iconColor="#B45309"
          title="Change password"
          subtitle="Secure your manager account"
          onPress={() => {
            setPwForm({ current: "", new: "", confirm: "" });
            setPwFormError("");
            setPasswordOpen(true);
          }}
        />
        <SettingsRow
          icon="call-outline"
          iconBg={design.colors.successLight}
          iconColor={design.colors.success}
          title="Phone number"
          subtitle={profileData.phone}
          trailing={<AppBadge variant="neutral">Login ID</AppBadge>}
          onPress={() => {
            setPhoneOtpError("");
            setPhoneOtpSent(false);
            setNewPhone("");
            setPhoneOtp("");
            setPhoneOpen(true);
          }}
          last
        />
      </View>

      {/* Preferences */}
      <SectionHeader title="Preferences" subtitle="How the app behaves for you" />
      <View style={styles.cardGroup}>
        <SettingsRow
          icon="business-outline"
          iconBg={design.colors.primaryLight}
          iconColor={design.colors.primary}
          title="Default building"
          subtitle={property?.name ?? "All buildings"}
          onPress={() => setBuildingSheetOpen(true)}
        />
        <SettingsRow
          icon="language-outline"
          iconBg={design.colors.infoLight}
          iconColor={design.colors.info}
          title="Language"
          subtitle="English (India)"
          onPress={() => comingSoon("Language")}
        />
        <View style={styles.switchRow}>
          <View style={[styles.rowIcon, { backgroundColor: design.colors.warningLight }]}>
            <Ionicons name="notifications-outline" size={18} color="#B45309" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
              Push notifications
            </AppText>
            <AppText variant="caption" color={design.colors.textSecondary}>
              Dues, requests and announcements
            </AppText>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={(v) => {
              setPushEnabled(v);
              if (v) router.push("/notifications");
            }}
            trackColor={{ false: design.colors.border, true: design.colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Support */}
      <SectionHeader title="Support" subtitle="Help and app information" />
      <View style={styles.cardGroup}>
        <SettingsRow
          icon="help-circle-outline"
          iconBg={design.colors.surfaceVariant}
          iconColor={design.colors.textSecondary}
          title="Help center"
          subtitle="Articles and FAQs"
          onPress={() => comingSoon("Help Center")}
        />
        <SettingsRow
          icon="chatbubbles-outline"
          iconBg={design.colors.surfaceVariant}
          iconColor={design.colors.textSecondary}
          title="Contact support"
          subtitle="Chat with our team"
          onPress={() => comingSoon("Contact Support")}
        />
        <SettingsRow
          icon="information-circle-outline"
          iconBg={design.colors.surfaceVariant}
          iconColor={design.colors.textSecondary}
          title="About PG Manager"
          subtitle="Version 1.0.0"
          onPress={() => comingSoon("About")}
          last
        />
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={() => setConfirmOut(true)} activeOpacity={0.9}>
        <Ionicons name="log-out-outline" size={19} color={design.colors.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
      <AppText variant="caption" color={design.colors.textMuted} style={{ textAlign: "center", marginTop: 10 }}>
        PG Manager · made for independent PG owners
      </AppText>

      <ConfirmDialog
        visible={confirmOut}
        title="Sign out?"
        message="You can log back in anytime with your phone number and password."
        confirmLabel="Sign out"
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => {
          setConfirmOut(false);
          logout().then(() => router.replace("/login"));
        }}
      />

      {/* Edit profile sheet */}
      <Sheet visible={editOpen} onClose={() => setEditOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={styles.sheetTitle}>
          Edit Profile
        </AppText>
        <AppInput
          label="Full name"
          placeholder="Your full name"
          value={editForm.full_name}
          onChangeText={(v) => setEditForm({ ...editForm, full_name: v })}
        />
        <AppInput
          label="Email"
          placeholder="name@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={editForm.email}
          onChangeText={(v) => setEditForm({ ...editForm, email: v })}
        />
        <View style={styles.helperCard}>
          <Ionicons name="lock-closed-outline" size={15} color={design.colors.primary} />
          <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
            Change your login mobile from Account → Phone number. We&apos;ll verify the new number
            with an OTP.
          </AppText>
        </View>
        <AppInput
          label="Emergency contact name"
          placeholder="Emergency contact name"
          value={editForm.emergency_contact_name}
          onChangeText={(v) => setEditForm({ ...editForm, emergency_contact_name: v })}
        />
        <AppInput
          label="Emergency contact phone"
          placeholder="Emergency contact number"
          keyboardType="phone-pad"
          value={editForm.emergency_contact_phone}
          onChangeText={(v) => setEditForm({ ...editForm, emergency_contact_phone: v })}
        />
        <AppInput
          label="ID number / KYC"
          placeholder="Aadhaar / driving licence"
          value={editForm.id_number}
          onChangeText={(v) => setEditForm({ ...editForm, id_number: v })}
        />
        {editFormError ? <Text style={styles.formError}>{editFormError}</Text> : null}
        <AppButton
          variant="primary"
          fullWidth
          loading={savingProfile}
          onPress={saveProfile}
          style={{ marginTop: 8 }}
        >
          Save Changes
        </AppButton>
      </Sheet>

      {/* Email / OTP sheet */}
      <Sheet visible={emailOpen} onClose={() => setEmailOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={styles.sheetTitle}>
          Email Settings
        </AppText>
        <View style={styles.currentEmailCard}>
          <Ionicons name="mail" size={16} color={design.colors.primary} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={design.colors.textMuted}>
              CURRENT EMAIL
            </AppText>
            <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
              {profileData.email || "Not added"}
            </AppText>
          </View>
          {profileData.email ? <AppBadge variant="success">Verified</AppBadge> : null}
        </View>
        <AppInput
          label="New email"
          placeholder="name@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={newEmail}
          onChangeText={(v) => {
            setNewEmail(v);
            setOtpSent(false);
          }}
        />
        <AppText variant="caption" color={design.colors.textMuted} style={styles.inputHelper}>
          We'll send a 6-digit verification code to this address.
        </AppText>
        {emailDevCode ? (
          <View style={styles.devCodeCard}>
            <Ionicons name="key-outline" size={15} color={design.colors.primary} />
            <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
              Dev OTP:{" "}
              <Text style={{ fontWeight: "800", color: design.colors.primary }}>{emailDevCode}</Text>
            </AppText>
          </View>
        ) : null}
        <AppInput
          label="Verification OTP"
          placeholder="6-digit code"
          keyboardType="number-pad"
          value={emailOtp}
          onChangeText={(v) => setEmailOtp(v.replace(/\D/g, ""))}
        />
        <AppText variant="caption" color={design.colors.textMuted} style={styles.inputHelper}>
          Enter the code from your inbox. It expires in 10 minutes.
        </AppText>
        {emailOtpError ? <Text style={styles.formError}>{emailOtpError}</Text> : null}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <AppButton
            variant="outline"
            size="md"
            loading={sendingOtp}
            onPress={sendEmailOtp}
            style={{ flex: 1 }}
          >
            {otpSent ? "Resend OTP" : "Send OTP"}
          </AppButton>
          <AppButton
            variant="primary"
            size="md"
            loading={verifyingEmail}
            disabled={!emailOtp.trim()}
            onPress={verifyEmailOtp}
            style={{ flex: 1 }}
          >
            Verify
          </AppButton>
        </View>
      </Sheet>

      {/* Phone / OTP sheet */}
      <Sheet visible={phoneOpen} onClose={() => setPhoneOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={styles.sheetTitle}>
          Change Mobile Number
        </AppText>
        <View style={styles.currentEmailCard}>
          <Ionicons name="call" size={16} color={design.colors.primary} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={design.colors.textMuted}>
              CURRENT MOBILE
            </AppText>
            <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
              {profileData.phone}
            </AppText>
          </View>
          <AppBadge variant="neutral">Login ID</AppBadge>
        </View>
        <AppInput
          label="New mobile number"
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          value={newPhone}
          onChangeText={(v) => {
            setNewPhone(v.replace(/\D/g, ""));
            setPhoneOtpSent(false);
          }}
        />
        <AppText variant="caption" color={design.colors.textMuted} style={styles.inputHelper}>
          We&apos;ll send a 6-digit verification code to this number.
        </AppText>
        {phoneDevCode ? (
          <View style={styles.devCodeCard}>
            <Ionicons name="key-outline" size={15} color={design.colors.primary} />
            <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
              Dev OTP:{" "}
              <Text style={{ fontWeight: "800", color: design.colors.primary }}>{phoneDevCode}</Text>
            </AppText>
          </View>
        ) : null}
        <AppInput
          label="Verification OTP"
          placeholder="6-digit code"
          keyboardType="number-pad"
          value={phoneOtp}
          onChangeText={(v) => setPhoneOtp(v.replace(/\D/g, ""))}
        />
        {phoneOtpError ? <Text style={styles.formError}>{phoneOtpError}</Text> : null}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <AppButton
            variant="outline"
            size="md"
            loading={sendingPhoneOtp}
            onPress={sendPhoneOtp}
            style={{ flex: 1 }}
          >
            {phoneOtpSent ? "Resend OTP" : "Send OTP"}
          </AppButton>
          <AppButton
            variant="primary"
            size="md"
            loading={verifyingPhone}
            disabled={!phoneOtp.trim()}
            onPress={verifyPhoneOtp}
            style={{ flex: 1 }}
          >
            Verify & Update
          </AppButton>
        </View>
      </Sheet>

      {/* Password sheet */}
      <Sheet visible={passwordOpen} onClose={() => setPasswordOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={styles.sheetTitle}>
          Change Password
        </AppText>
        <AppInput
          label="Current password"
          placeholder="Enter current password"
          secureTextEntry
          value={pwForm.current}
          onChangeText={(v) => setPwForm({ ...pwForm, current: v })}
        />
        <AppInput
          label="New password"
          placeholder="At least 6 characters"
          secureTextEntry
          value={pwForm.new}
          onChangeText={(v) => setPwForm({ ...pwForm, new: v })}
        />
        <AppInput
          label="Confirm new password"
          placeholder="Re-enter new password"
          secureTextEntry
          value={pwForm.confirm}
          onChangeText={(v) => setPwForm({ ...pwForm, confirm: v })}
        />
        <AppText variant="caption" color={design.colors.textMuted} style={styles.inputHelper}>
          Use at least 6 characters with a mix of letters and numbers.
        </AppText>
        {pwFormError ? <Text style={styles.formError}>{pwFormError}</Text> : null}
        <AppButton
          variant="primary"
          fullWidth
          loading={changingPw}
          onPress={changePassword}
          style={{ marginTop: 8 }}
        >
          Update Password
        </AppButton>
      </Sheet>

      {/* Avatar sheet */}
      <Sheet visible={avatarOpen} onClose={() => setAvatarOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={styles.sheetTitle}>
          Set Profile Picture
        </AppText>
        <View style={styles.uploadArea}>
          <AppAvatar
            initials={initials}
            size={76}
            variant="primary"
            src={profileData.avatar_url ? { uri: profileData.avatar_url } : undefined}
          />
        </View>
        <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAvatar("camera")} disabled={savingAvatar}>
          <Ionicons name="camera" size={20} color={design.colors.primary} />
          <Text style={styles.uploadText}>{savingAvatar ? "Uploading…" : "Take Photo"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.uploadBtn, { marginTop: 8 }]} onPress={() => pickAvatar("library")} disabled={savingAvatar}>
          <Ionicons name="image-outline" size={20} color={design.colors.secondary} />
          <Text style={styles.uploadText}>Choose from Album</Text>
        </TouchableOpacity>
      </Sheet>

      {/* Default building sheet */}
      <Sheet visible={buildingSheetOpen} onClose={() => setBuildingSheetOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={styles.sheetTitle}>
          Default Building
        </AppText>
        <AppText variant="bodySmall" color={design.colors.textSecondary} style={styles.sheetHint}>
          Choose which building opens first in the dashboard.
        </AppText>
        <TouchableOpacity
          style={[styles.buildingOption, propertyId === null && styles.buildingOptionSelected]}
          onPress={() => {
            setPropertyId(null);
            setBuildingSheetOpen(false);
          }}
        >
          <Ionicons
            name="albums-outline"
            size={20}
            color={propertyId === null ? design.colors.primary : design.colors.textMuted}
          />
          <View style={styles.buildingOptionText}>
            <AppText variant="body" color={design.colors.textPrimary}>
              All buildings
            </AppText>
            <AppText variant="caption" color={design.colors.textSecondary}>
              Aggregated stats
            </AppText>
          </View>
          {propertyId === null && <Ionicons name="checkmark" size={20} color={design.colors.primary} />}
        </TouchableOpacity>
        {properties.map((b) => {
          const active = b.id === propertyId;
          return (
            <TouchableOpacity
              key={b.id}
              style={[styles.buildingOption, active && styles.buildingOptionSelected]}
              onPress={() => {
                setPropertyId(b.id);
                setBuildingSheetOpen(false);
              }}
            >
              <Ionicons
                name="business-outline"
                size={20}
                color={active ? design.colors.primary : design.colors.textMuted}
              />
              <View style={styles.buildingOptionText}>
                <AppText variant="body" color={design.colors.textPrimary}>
                  {b.name}
                </AppText>
                {b.address ? (
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    {b.address}
                  </AppText>
                ) : null}
              </View>
              {active && <Ionicons name="checkmark" size={20} color={design.colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </Sheet>
    </ScrollView>
  );
}

function SettingsRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  trailing,
  onPress,
  last,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, last && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ?? <Ionicons name="chevron-forward" size={17} color={design.colors.textMuted} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },
  content: { paddingBottom: 110 },

  // Hero
  hero: {
    backgroundColor: design.colors.primary,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    alignItems: "center",
    overflow: "hidden",
  },
  heroGlowA: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -70,
    right: -40,
  },
  heroGlowB: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -40,
    left: -24,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 10,
  },
  heroEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  heroIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: { marginBottom: 10 },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: design.colors.primary,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 7,
  },
  rolePillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  editProfileBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 18,
    minHeight: 42,
  },
  editProfileText: { color: design.colors.primary, fontWeight: "800", fontSize: 13 },

  // Sections
  cardGroup: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    paddingHorizontal: 14,
    marginBottom: 8,
    ...getShadow("sm"),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: design.colors.border,
    minHeight: 62,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    minHeight: 62,
  },

  signOutBtn: {
    marginHorizontal: 16,
    marginTop: 18,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: design.colors.dangerLight,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.16)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  signOutText: { color: design.colors.danger, fontWeight: "800", fontSize: 14 },

  // Sheets
  sheetTitle: { marginBottom: 10 },
  sheetHint: { marginBottom: 12, lineHeight: 19 },
  helperCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: design.colors.primaryLight,
    marginBottom: 10,
  },
  currentEmailCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: design.colors.background,
    borderWidth: 1,
    borderColor: design.colors.border,
    marginBottom: 10,
  },
  devCodeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: design.colors.primaryLight,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  inputHelper: { marginTop: -4, marginBottom: 8, lineHeight: 16 },
  formError: { color: design.colors.danger, marginTop: 6, textAlign: "center", fontSize: 12 },
  uploadArea: { alignItems: "center", marginBottom: 14 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 13,
    borderRadius: 12,
    backgroundColor: design.colors.surfaceVariant,
    minHeight: 48,
  },
  uploadText: { fontSize: 14, fontWeight: "700", color: design.colors.textPrimary, marginLeft: 8 },
  buildingOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  buildingOptionSelected: {
    borderColor: design.colors.primary,
    backgroundColor: design.colors.primaryLight,
  },
  buildingOptionText: { flex: 1 },
});
