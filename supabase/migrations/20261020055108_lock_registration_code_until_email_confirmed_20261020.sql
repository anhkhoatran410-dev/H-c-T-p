-- Close the pre-confirmation student-code leak. Apply only after the UI handler
-- that requests this RPC after the email-confirmation redirect is deployed.
create or replace function public.get_registration_code(p_user_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_confirmed timestamptz;
  v_code text;
  v_name text;
  v_email text;
begin
  if v_uid is null then
    raise exception 'Hãy bấm liên kết xác nhận trong email để nhận mã học sinh.';
  end if;

  select email_confirmed_at, lower(email), coalesce(raw_user_meta_data->>'full_name','')
    into v_confirmed, v_email, v_name
  from auth.users
  where id = v_uid;

  if v_confirmed is null then
    raise exception 'Email chưa được xác thực.';
  end if;

  select student_code into v_code
  from public.profiles
  where id = v_uid;

  if v_code is null or v_code !~ '^[0-9]{6}$' then
    v_code := public.generate_unique_student_code();
    update public.profiles
       set student_code = v_code, updated_at = now()
     where id = v_uid;
    if not found then
      insert into public.profiles(id, full_name, student_code, role, status, email)
      values (v_uid, v_name, v_code, 'student', 'active', v_email);
    end if;
  end if;

  return v_code;
end;
$$;

revoke all on function public.get_registration_code(uuid, text) from public, anon, authenticated;
grant execute on function public.get_registration_code(uuid, text) to authenticated, service_role;
