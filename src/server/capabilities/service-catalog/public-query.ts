import type { Pool } from "pg";
export type PublicPackage = Readonly<{ id: string; name: string; description: string | null; priceCentavos: string; durationMinutes: number; hasPromotion: boolean }>;
export async function listActivePackages(pool: Pick<Pool, "query">): Promise<PublicPackage[]> {
  const result = await pool.query<PublicPackage>(
    `select revision.package_id as id, revision.name, revision.description,
            revision.price_centavos::text as "priceCentavos", revision.duration_minutes as "durationMinutes",
            exists (
              select 1 from app.promotion_services service
              join app.promotions promotion using (promotion_id)
              cross join app.operating_calendar calendar
              where service.package_id = revision.package_id and promotion.state = 'ACTIVE'
                and promotion.valid_through >= (now() at time zone calendar.timezone)::date
            ) as "hasPromotion"
     from app.service_package_revisions revision
     join app.service_packages package
       on package.package_id = revision.package_id and package.current_revision = revision.revision
     where revision.state = 'ACTIVE'
     order by revision.name`,
  );
  return result.rows;
}
