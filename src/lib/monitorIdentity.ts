// Shared identity resolver for Monitor tables.
// Guarantees the first three columns (Client | City | Project) are always
// derived from sites + brands + certifications, never from cached record columns.

import { supabase } from "@/integrations/supabase/client";

export interface MonitorIdentity {
  client: string | null;      // brands.name
  city: string | null;        // sites.city
  project: string | null;     // certifications.name ?? sites.name
  region: string | null;
  country: string | null;
  brand_id: string | null;
}

export interface IdentityMaps {
  bySiteId: Map<string, MonitorIdentity>;
  byCertId: Map<string, MonitorIdentity>;
}

/**
 * Fetches sites + brands + certifications and returns two lookup maps
 * so any Monitor row can be re-identified by site_id or certification_id.
 */
export async function loadIdentityMaps(
  siteIds: string[],
  certIds: string[],
): Promise<IdentityMaps> {
  const uniqSites = Array.from(new Set(siteIds.filter(Boolean)));
  const uniqCerts = Array.from(new Set(certIds.filter(Boolean)));

  const [sitesRes, certsRes] = await Promise.all([
    uniqSites.length
      ? supabase.from("sites").select("id, name, city, country, region, brand_id").in("id", uniqSites)
      : Promise.resolve({ data: [], error: null }),
    uniqCerts.length
      ? supabase.from("certifications").select("id, name, site_id").in("id", uniqCerts)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const sites = (sitesRes.data ?? []) as Array<{
    id: string; name: string | null; city: string | null;
    country: string | null; region: string | null; brand_id: string | null;
  }>;
  const certs = (certsRes.data ?? []) as Array<{
    id: string; name: string | null; site_id: string | null;
  }>;

  const brandIds = Array.from(new Set(sites.map((s) => s.brand_id).filter(Boolean) as string[]));
  const brandsRes = brandIds.length
    ? await supabase.from("brands").select("id, name").in("id", brandIds)
    : { data: [], error: null };
  const brandNameById = new Map<string, string>();
  ((brandsRes.data ?? []) as Array<{ id: string; name: string }>).forEach((b) =>
    brandNameById.set(b.id, b.name),
  );

  const sitesById = new Map<string, typeof sites[number]>();
  sites.forEach((s) => sitesById.set(s.id, s));

  const identityForSite = (siteId: string | null, certName?: string | null): MonitorIdentity => {
    const s = siteId ? sitesById.get(siteId) : undefined;
    return {
      client: s?.brand_id ? brandNameById.get(s.brand_id) ?? null : null,
      city: s?.city ?? null,
      project: certName || s?.name || null,
      region: s?.region ?? null,
      country: s?.country ?? null,
      brand_id: s?.brand_id ?? null,
    };
  };

  const bySiteId = new Map<string, MonitorIdentity>();
  for (const s of sites) bySiteId.set(s.id, identityForSite(s.id, null));

  const byCertId = new Map<string, MonitorIdentity>();
  for (const c of certs) byCertId.set(c.id, identityForSite(c.site_id, c.name));

  return { bySiteId, byCertId };
}
