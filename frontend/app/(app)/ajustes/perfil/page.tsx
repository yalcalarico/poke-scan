import type { Metadata } from "next";
import { ScreenContainer } from "@/components/layout/screen-container";
import { ScreenHeader } from "@/components/layout/screen-header";
import { ProfileEditor } from "@/components/settings/profile-editor";
import { RequireAuth } from "@/components/settings";
export const metadata: Metadata = {
  title: "Tus datos",
  robots: { index: false, follow: false },
};
export default function AccountPage() {
  return (
    <>
      <ScreenHeader title="Tus datos" back={{ href: "/ajustes" }} />
      <ScreenContainer labelledBy="account-title">
        <h1 id="account-title" className="mb-6 text-h1 text-primary">
          Tus datos
        </h1>
        <RequireAuth>
          <ProfileEditor />
        </RequireAuth>
      </ScreenContainer>
    </>
  );
}
