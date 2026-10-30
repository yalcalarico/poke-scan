import type { Metadata } from "next";
import { ScreenContainer } from "@/components/layout/screen-container";
import { ScreenHeader } from "@/components/layout/screen-header";
import { PasswordSettings } from "@/components/settings/password-settings";
export const metadata: Metadata = {
  title: "Cambiar clave",
  robots: { index: false, follow: false },
};
export default function AccountPage() {
  return (
    <>
      <ScreenHeader title="Cambiar clave" back={{ href: "/ajustes" }} />
      <ScreenContainer labelledBy="account-title">
        <h1 id="account-title" className="mb-6 text-h1 text-primary">
          Cambiar clave
        </h1>
        <PasswordSettings />
      </ScreenContainer>
    </>
  );
}
