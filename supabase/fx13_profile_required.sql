-- fx13_profile_required.sql
-- Read rules that said "everyone signed in" (true) or "anyone who is not a vendor" also let in a signed-in
-- account that has NO profile (e.g. a public sign-up). Now a Fixnar profile is required for every read.
-- Logged-out visitors were already blocked. Same people keep the same access as before. Idempotent.

alter policy fx_assets_read   on public.assets            using (my_role() is not null);
alter policy fx_ds_read       on public.dispatch_settings using (my_role() is not null);
alter policy fx_stores_read   on public.stores            using (my_role() is not null);
alter policy fx_vendors_read  on public.vendors           using (my_role() is not null);
alter policy fx_profiles_read on public.profiles          using ((my_role() is not null and my_role() <> 'vendor') or id = auth.uid());
alter policy fx_ps_read       on public.part_stock        using (my_role() is not null and my_role() <> 'vendor');
alter policy fx_parts_read    on public.parts             using (my_role() is not null and my_role() <> 'vendor');
alter policy fx_ppm_read      on public.ppm_tasks         using (my_role() is not null and my_role() <> 'vendor');
alter policy fx_sm_read       on public.stock_movements   using (my_role() is not null and my_role() <> 'vendor');
alter policy fx_sta_read      on public.store_technician_assignments using (my_role() is not null and my_role() <> 'vendor');
alter policy fx_us_read       on public.user_stores       using (my_role() is not null and my_role() <> 'vendor');
