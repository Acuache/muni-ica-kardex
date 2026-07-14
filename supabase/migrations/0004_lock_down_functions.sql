-- SPEC 02 · Endurecimiento — cerrar el acceso RPC a las funciones de trigger.
--
-- El advisor de seguridad de Supabase marca que las funciones `security definer`
-- quedan expuestas por PostgREST como RPC (/rest/v1/rpc/…). Las funciones de
-- TRIGGER no deben poder invocarse por API: el motor de triggers las dispara
-- igual, sin depender del privilegio EXECUTE del rol que hace el DML.
--
-- Postgres concede EXECUTE a PUBLIC por defecto, y anon/authenticated heredan de
-- PUBLIC; por eso hay que revocar de PUBLIC (revocar solo de anon/authenticated
-- no basta).
--
-- `is_admin()` se deja intencionalmente ejecutable: las policies RLS la invocan y
-- revocarla rompería el `select` sobre profiles. Su exposición es benigna (solo
-- revela si el propio llamante es admin). Si se quisiera silenciar también ese
-- WARN, la vía limpia sería moverla a un esquema `private` no expuesto por la API.

revoke execute on function public.handle_new_user()     from public, anon, authenticated;
revoke execute on function public.guard_profile_write()  from public, anon, authenticated;
revoke execute on function public.guard_profile_delete() from public, anon, authenticated;
