"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { repository } from "@/lib/repository";
import { DEFAULT_PORTFOLIO_SETTINGS, type PortfolioSettings } from "@/lib/repository/types";
import type { DistributorProfile, RetailerProfile } from "@/lib/scenario/profiles";
import {
  EXAMPLE_DISTRIBUTOR_PROFILES,
  EXAMPLE_PROFILES_SEED,
  EXAMPLE_RETAILER_PROFILES,
  mergeSeedRecords,
  needsSeed,
} from "@/lib/scenario/seeds";

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
        if (state) setPortfolioSettings(state.portfolioSettings);

        const retailers = state?.retailerProfiles ?? [];
        const distributors = state?.distributorProfiles ?? [];
        if (!needsSeed(state?.appliedSeeds, EXAMPLE_PROFILES_SEED)) {
          setRetailerProfiles(retailers);
          setDistributorProfiles(distributors);
          setHydrated(true);
          return;
        }

        // One-time delivery of the example customer profiles — to first runs
        // and to workspaces that predate the bundle alike. Recording the seed
        // id is what stops deleted examples from reappearing on next load.
        const nextRetailers = mergeSeedRecords(retailers, EXAMPLE_RETAILER_PROFILES);
        const nextDistributors = mergeSeedRecords(distributors, EXAMPLE_DISTRIBUTOR_PROFILES);
        setRetailerProfiles(nextRetailers);
        setDistributorProfiles(nextDistributors);
        setHydrated(true);
        void repository
          .saveDistributorProfiles(nextDistributors)
          .then(() => repository.saveRetailerProfiles(nextRetailers))
          .then(() =>
            repository.saveAppliedSeeds([...(state?.appliedSeeds ?? []), EXAMPLE_PROFILES_SEED]),
          )
          .catch((error: unknown) => console.error("Failed to persist example profiles", error));
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
