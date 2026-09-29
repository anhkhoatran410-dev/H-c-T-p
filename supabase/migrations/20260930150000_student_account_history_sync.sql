-- Account-wide student history sync.
-- The six-digit student code identifies the student's account across devices.

create or replace function public.attempt_list_student(p_student_code text)
returns setof public.user_attempts
language sql
security definer
set search_path = public, extensions
as $$
  select ua.*
  from public.user_attempts ua
  where trim(coalesce(ua.student_code,'')) = trim(coalesce(p_student_code,''))
    and exists (
      select 1 from public.profiles p
      where trim(coalesce(p.student_code,'')) = trim(coalesce(p_student_code,''))
        and p.status = 'active'
    )
  order by ua.created_at desc
  limit 300
$$;

create or replace function public.attempt_review_student(
  p_student_code text,
  p_attempt_id uuid,
  p_question_index integer
)
returns table(status_code integer, reviewed_indexes jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_wrong jsonb;
  v_reviewed jsonb;
begin
  if trim(coalesce(p_student_code,'')) = '' or p_attempt_id is null or p_question_index is null
     or p_question_index < 0 or p_question_index > 500 then
    return query select 404, null::jsonb;
    return;
  end if;

  if not exists (
    select 1 from public.profiles p
    where trim(coalesce(p.student_code,'')) = trim(coalesce(p_student_code,''))
      and p.status = 'active'
  ) then
    return query select 404, null::jsonb;
    return;
  end if;

  select wrong_indexes, reviewed_indexes
  into v_wrong, v_reviewed
  from public.user_attempts
  where id = p_attempt_id
    and trim(coalesce(student_code,'')) = trim(coalesce(p_student_code,''))
  limit 1;

  if not found then
    return query select 404, null::jsonb;
    return;
  end if;

  v_wrong := coalesce(v_wrong, '[]'::jsonb);
  if not exists (
    select 1 from jsonb_array_elements(v_wrong) x
    where (x #>> '{}') ~ '^\\d+$'
      and (x #>> '{}')::integer = p_question_index
  ) then
    return query select 400, null::jsonb;
    return;
  end if;

  v_reviewed := coalesce(v_reviewed, '[]'::jsonb);
  if not exists (
    select 1 from jsonb_array_elements(v_reviewed) x
    where (x #>> '{}') ~ '^\\d+$'
      and (x #>> '{}')::integer = p_question_index
  ) then
    v_reviewed := v_reviewed || to_jsonb(p_question_index);
  end if;

  update public.user_attempts
  set reviewed_indexes = v_reviewed
  where id = p_attempt_id
    and trim(coalesce(student_code,'')) = trim(coalesce(p_student_code,''));

  return query select 200, v_reviewed;
end;
$$;

revoke all on function public.attempt_list_student(text) from public, anon, authenticated;
revoke all on function public.attempt_review_student(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.attempt_list_student(text) to anon;
grant execute on function public.attempt_review_student(text, uuid, integer) to anon;
