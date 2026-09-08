import { useEffect, useState } from "react";
import { HeroContent } from "./components/HeroContent";
import { AboutSection } from "./components/AboutSection";
import { TrainingScheduleSection } from "./components/TrainingScheduleSection";
import { AnnouncementsSection } from "./components/AnnouncementsSection";
import { ContactSection } from "./components/ContactSection";
import { ContactDock } from "./components/ContactDock";
import { PreRegModal } from "./components/PreRegModal";
import { usePreRegRequestStore } from "../../features/preReg/preRegStore";

export function HomePage() {
  const [preRegOpen, setPreRegOpen] = useState(false);
  const requested = usePreRegRequestStore((s) => s.requested);
  const clearRequest = usePreRegRequestStore((s) => s.clear);

  useEffect(() => {
    if (requested) {
      setPreRegOpen(true);
      clearRequest();
    }
  }, [requested, clearRequest]);

  return (
    <div className="bg-paper pb-16 dark:bg-ink">
      <HeroContent />
      <AboutSection />
      <TrainingScheduleSection />
      <AnnouncementsSection />
      <ContactSection />

      <ContactDock />
      <PreRegModal open={preRegOpen} onClose={() => setPreRegOpen(false)} />
    </div>
  );
}
