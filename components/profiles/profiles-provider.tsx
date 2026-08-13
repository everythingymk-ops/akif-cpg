"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { repository } from "@/lib/repository";
import { DEFAULT_PORTFOLIO_SETTINGS, type PortfolioSettings } from "@/lib/repository/types";
import { diffChangedById } from "@/lib/scenario/diff";
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
 *
 * The profile dialog still edits a whole draft list and saves once; this
 * provider turns that into per-record writes, deleting only what the user
 * removed from the list they were shown (see lib/scenario/diff.ts).
 */
interface ProfilesContextValue {
  retailerProfiles: RetailerProfile[];
  distributorProfiles: DistributorProfile[];
  portfolioSettings: PortfolioSettings;
  /** `snapshot` is the list the editor opened with; anything missing from
   *  `next` that was in it counts as a deletion. */
  saveRetailerProfiles: (next: RetailerProfile[], snapshot: readonly RetailerProfile[]) => void;
  saveDistributorProfiles: (
    next: DistributorProfile[],
    snapshot: readonly DistributorProfile[],
  ) => void;
  savePortfolioSettings: (settings: PortfolioSettings) => void;
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null);

/** Portfolio thresholds are typed character by character; one write per
 *  keystroke is fine against localStorage and wasteful over a network. */
const SETTINGS_DEBOUNCE_MS = 400;

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [retailerProfiles, setRetailerProfiles] = useState<RetailerProfile[]>([]);
  const [distributorProfiles, setDistributorProfiles] = useState<DistributorProfile[]>([]);
  const [portfolioSettings, setPortfolioSettings] = useState<PortfolioSettings>(
    DEFAULT_PORTFOLIO_SETTINGS,
  );
  // Refs, not memo locals: the memo re-runs on every keystroke, so a timer
  // held there would be a fresh undefined each time and never debounce.
  const settingsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSettings = useRef<PortfolioSettings | null>(null);

  // Don't lose the last keystrokes when the tab closes mid-debounce.
  useEffect(
    () => () => {
      if (settingsTimer.current === undefined) return;
      clearTimeout(settingsTimer.current);
      if (pendingSettings.current) {
        void repository.savePortfolioSettings(pendingSettings.current).catch(console.error);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    repository
      .loadWorkspace()
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

        const newRetailers = nextRetailers.filter((p) => !retailers.some((e) => e.id === p.id));
        const newDistributors = nextDistributors.filter(
          (p) => !distributors.some((e) => e.id === p.id),
        );
        void Promise.all([
          ...newDistributors.map((profile) => repository.upsertDistributorProfile(profile)),
          ...newRetailers.map((profile) => repository.upsertRetailerProfile(profile)),
        ])
          .then(() => repository.recordAppliedSeed(EXAMPLE_PROFILES_SEED))
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

  const value = useMemo<ProfilesContextValue>(() => {
    return {
      retailerProfiles,
      distributorProfiles,
      portfolioSettings,

      saveRetailerProfiles: (next, snapshot) => {
        setRetailerProfiles(next);
        const { upserts, deletedIds } = diffChangedById(snapshot, next);
        void Promise.all([
          ...upserts.map((profile) => repository.upsertRetailerProfile(profile)),
          ...deletedIds.map((id) => repository.deleteRetailerProfile(id)),
        ]).catch((error: unknown) => console.error("Failed to save retailer profiles", error));
      },

      saveDistributorProfiles: (next, snapshot) => {
        setDistributorProfiles(next);
        const { upserts, deletedIds } = diffChangedById(snapshot, next);
        void Promise.all([
          ...upserts.map((profile) => repository.upsertDistributorProfile(profile)),
          ...deletedIds.map((id) => repository.deleteDistributorProfile(id)),
        ]).catch((error: unknown) => console.error("Failed to save distributor profiles", error));
      },

      savePortfolioSettings: (settings) => {
        setPortfolioSettings(settings);
        pendingSettings.current = settings;
        clearTimeout(settingsTimer.current);
        settingsTimer.current = setTimeout(() => {
          settingsTimer.current = undefined;
          pendingSettings.current = null;
          void repository.savePortfolioSettings(settings).catch(console.error);
        }, SETTINGS_DEBOUNCE_MS);
      },
    };
  }, [retailerProfiles, distributorProfiles, portfolioSettings]);

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
