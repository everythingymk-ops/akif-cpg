"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { repository } from "@/lib/repository";
import { DEFAULT_PORTFOLIO_SETTINGS, type PortfolioSettings } from "@/lib/repository/types";
import type { DistributorProfile, RetailerProfile } from "@/lib/scenario/profiles";

/**
 * Reusable customer profiles (PRD §46–47) and the configurable §44 portfolio
 * thresholds, persisted through the repository. Children render after
 * hydration, consistent with the other providers.
 */
interface ProfilesContextValue {
  retailerProfiles: RetailerProfile[];
  distributorProfiles: DistributorProfile[];
  portfolioSettings: PortfolioSettings;
  saveRetailerProfiles: (profiles: RetailerProfile[]) => void;
  saveDistributorProfiles: (profiles: DistributorProfile[]) => void;
  savePortfolioSettings: (settings: PortfolioSettings) => void;
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null);

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [retailerProfiles, setRetailerProfiles] = useState<RetailerProfile[]>([]);
  const [distributorProfiles, setDistributorProfiles] = useState<DistributorProfile[]>([]);
  const [portfolioSettings, setPortfolioSettings] = useState<PortfolioSettings>(
    DEFAULT_PORTFOLIO_SETTINGS,
  );

  useEffect(() => {
    let cancelled = false;
    repository
      .loadState()
      .then((state) => {
        if (cancelled) return;
        if (state) {
          setRetailerProfiles(state.retailerProfiles);
          setDistributorProfiles(state.distributorProfiles);
          setPortfolioSettings(state.portfolioSettings);
        }
        setHydrated(true);
      })
      .catch((error: unknown) => {
        console.error("Failed to load persisted profiles", error);
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ProfilesContextValue>(
    () => ({
      retailerProfiles,
      distributorProfiles,
      portfolioSettings,
      saveRetailerProfiles: (profiles) => {
        setRetailerProfiles(profiles);
        void repository.saveRetailerProfiles(profiles).catch(console.error);
      },
      saveDistributorProfiles: (profiles) => {
        setDistributorProfiles(profiles);
        void repository.saveDistributorProfiles(profiles).catch(console.error);
      },
      savePortfolioSettings: (settings) => {
        setPortfolioSettings(settings);
        void repository.savePortfolioSettings(settings).catch(console.error);
      },
    }),
    [retailerProfiles, distributorProfiles, portfolioSettings],
  );

  if (!hydrated) return null;
  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export function useProfiles(): ProfilesContextValue {
  const context = useContext(ProfilesContext);
  if (!context) {
    throw new Error("useProfiles must be used within a ProfilesProvider");
  }
  return context;
}
