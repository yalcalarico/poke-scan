import type { Metadata } from "next";
import { ScreenContainer } from "@/components/layout/screen-container";
import { ScreenHeader } from "@/components/layout/screen-header";
import { RequireAuth } from "@/components/settings";
import { ShowcaseSettings } from "@/components/home/showcase-settings";
export const metadata: Metadata = {
  title: "Personalizar vitrina",
  robots: { index: false, follow: false },
};
export default function ShowcasePage() {
  return (
    <>
      <ScreenHeader title="Tu vitrina" back={{ href: "/inicio" }} />
      <ScreenContainer labelledBy="showcase-title">
        <h1 id="showcase-title" className="mb-6 text-h1 text-primary">
          Una vitrina bien tuya.
        </h1>
        <RequireAuth>
          <ShowcaseSettings />
        </RequireAuth>
      </ScreenContainer>
    </>
  );
}
