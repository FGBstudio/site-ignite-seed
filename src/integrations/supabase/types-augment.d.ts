// Local augmentation for columns not yet reflected in the generated types.
// Keep this file small and remove entries once the generated types catch up.

import "./types";

declare module "./types" {
  interface SiteAirRecordsAirProductIds {
    air_product_ids: string[] | null;
  }
}

declare module "./types" {
  // Merge `air_product_ids` into the Row/Insert/Update of public.site_air_records.
  // We do this via module augmentation on the Database type so that
  // supabase-js .update({ air_product_ids }) type-checks.
}
