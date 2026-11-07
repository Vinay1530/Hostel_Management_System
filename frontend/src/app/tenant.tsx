import { Redirect } from "expo-router";

// Tenants now land in the tab layout (My Stay / Dues / Chat / Profile).
export default function TenantRedirect() {
  return <Redirect href="/(tenant-tabs)/home" />;
}
