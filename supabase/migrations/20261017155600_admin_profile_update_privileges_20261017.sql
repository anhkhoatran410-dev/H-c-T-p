-- Grant the server-side Admin API narrowly scoped profile-write access.
-- Browser roles stay unable to directly update profile rows.
GRANT SELECT (id) ON TABLE public.profiles TO service_role;
GRANT UPDATE (full_name, student_code, status, updated_at) ON TABLE public.profiles TO service_role;
