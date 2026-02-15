import WizardTopbar from "./WizardTopbar";

export default function OnboardingWizardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sb-bg min-h-screen">
      <WizardTopbar />
      <div className="sb-container pb-28 pt-6">{children}</div>
    </div>
  );
}
