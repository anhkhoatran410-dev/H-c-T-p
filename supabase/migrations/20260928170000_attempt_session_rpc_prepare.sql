-- Prepare server-side attempt RPCs before the table lockdown.
-- Direct table privileges remain unchanged in this migration so old production code stays compatible.

create or replace function public._attempt_device_id(p_token text)
returns text
language plpgsql
immutable
security definer
set search_path = public, extensions
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43,64}$' then
    return null;
  end if;
  return encode(extensions.digest(p_token, 'sha256'), 'hex');
end;
$$;

revoke all on function public._attempt_device_id(text) from public, anon, authenticated;

create or replace function public._attempt_answer_correct(p_question jsonb, p_answer jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = public, extensions
as $$
declare
  v_type text := coalesce(p_question->>'type', 'mcq');
  v_expected text;
  v_actual text;
  v_expected_idx integer;
  v_actual_idx integer;
  v_expected_arr jsonb;
  v_answer_arr jsonb;
  v_i integer;
begin
  if v_type = 'true_false' then
    v_expected_arr := p_question->'answers';
    v_answer_arr := p_answer;
    if jsonb_typeof(v_expected_arr) <> 'array'
       or jsonb_array_length(v_expected_arr) <> 4
       or jsonb_typeof(v_answer_arr) <> 'array'
       or jsonb_array_length(v_answer_arr) <> 4 then
      return false;
    end if;
    for v_i in 0..3 loop
      if (v_answer_arr -> v_i) is distinct from (v_expected_arr -> v_i) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  if v_type = 'short' then
    v_expected := lower(btrim(coalesce(p_question->>'answer', '')));
    if v_expected = '' then
      return false;
    end if;

    if jsonb_typeof(p_answer) = 'array' then
      select string_agg(value, '' order by ord)
      into v_actual
      from jsonb_array_elements_text(p_answer) with ordinality as x(value, ord);
    elsif jsonb_typeof(p_answer) in ('string', 'number', 'boolean') then
      v_actual := p_answer #>> '{}';
    else
      v_actual := null;
    end if;

    return lower(btrim(coalesce(v_actual, ''))) = v_expected;
  end if;

  v_expected := p_question->>'a';
  if v_expected !~ '^\d+$' then
    return false;
  end if;
  v_expected_idx := v_expected::integer;

  if jsonb_typeof(p_answer) = 'number' then
    if (p_answer #>> '{}') !~ '^\d+$' then
      return false;
    end if;
    v_actual_idx := (p_answer #>> '{}')::integer;
  elsif jsonb_typeof(p_answer) = 'string' and (p_answer #>> '{}') ~ '^\d+$' then
    v_actual_idx := (p_answer #>> '{}')::integer;
  else
    return false;
  end if;

  return v_actual_idx = v_expected_idx;
end;
$$;

revoke all on function public._attempt_answer_correct(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.attempt_submit_session(
  p_token text,
  p_exam_id uuid,
  p_student_name text,
  p_student_code text,
  p_duration_seconds integer,
  p_auto_submitted boolean,
  p_answers jsonb
)
returns setof public.user_attempts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device_id text;
  v_exam public.exams%rowtype;
  v_questions jsonb;
  v_answer jsonb;
  v_correct integer := 0;
  v_wrong_indexes jsonb := '[]'::jsonb;
  v_total integer;
  v_score integer;
  v_bounded_duration integer;
  v_max_duration integer;
  v_i integer;
  v_now timestamptz := now();
  v_name text := btrim(coalesce(p_student_name, ''));
  v_code text := nullif(btrim(coalesce(p_student_code, '')), '');
  v_row public.user_attempts%rowtype;
begin
  v_device_id := public._attempt_device_id(p_token);
  if v_device_id is null then
    return;
  end if;

  if p_exam_id is null or v_name = '' or length(v_name) > 200 then
    return;
  end if;

  if v_code is not null and length(v_code) > 100 then
    return;
  end if;

  if jsonb_typeof(p_answers) <> 'object'
     or (select count(*) from jsonb_object_keys(p_answers)) > 1000 then
    return;
  end if;

  select *
  into v_exam
  from public.exams
  where id = p_exam_id
    and status = 'active'
  limit 1;

  if not found then
    return;
  end if;

  if v_exam.open_at is not null and v_now < v_exam.open_at then
    return;
  end if;
  if v_exam.close_at is not null and v_now > v_exam.close_at then
    return;
  end if;

  v_questions := coalesce(v_exam.questions, '[]'::jsonb);
  if jsonb_typeof(v_questions) <> 'array'
     or jsonb_array_length(v_questions) < 1
     or jsonb_array_length(v_questions) > 500 then
    return;
  end if;

  v_total := jsonb_array_length(v_questions);

  for v_i in 0..v_total - 1 loop
    v_answer := coalesce(p_answers -> (v_i::text), 'null'::jsonb);
    if public._attempt_answer_correct(v_questions -> v_i, v_answer) then
      v_correct := v_correct + 1;
    else
      v_wrong_indexes := v_wrong_indexes || to_jsonb(v_i);
    end if;
  end loop;

  v_score := case
    when v_total > 0 then round((v_correct::numeric / v_total::numeric) * 100)::integer
    else 0
  end;

  v_max_duration := case
    when coalesce(v_exam.duration, 0) > 0 then v_exam.duration * 60
    else 2147483647
  end;
  v_bounded_duration := least(greatest(coalesce(p_duration_seconds, 0), 0), v_max_duration);

  insert into public.user_attempts(
    device_id, exam_id, exam_title, student_name, student_code,
    score, correct, total, duration_seconds, auto_submitted,
    answers, wrong_indexes, reviewed_indexes
  )
  values (
    v_device_id, v_exam.id, v_exam.title, v_name, v_code,
    v_score, v_correct, v_total, v_bounded_duration, coalesce(p_auto_submitted, false),
    p_answers, v_wrong_indexes, '[]'::jsonb
  )
  returning * into v_row;

  return next v_row;
end;
$$;

create or replace function public.attempt_list_session(p_token text)
returns setof public.user_attempts
language sql
security definer
set search_path = public, extensions
as $$
  select ua.*
  from public.user_attempts ua
  where ua.device_id = public._attempt_device_id(p_token)
  order by ua.created_at desc
  limit 300
$$;

create or replace function public.attempt_review_session(
  p_token text,
  p_attempt_id uuid,
  p_question_index integer
)
returns table(status_code integer, reviewed_indexes jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device_id text;
  v_wrong jsonb;
  v_reviewed jsonb;
begin
  v_device_id := public._attempt_device_id(p_token);
  if v_device_id is null or p_attempt_id is null or p_question_index is null or p_question_index < 0 or p_question_index > 500 then
    return query select 404, null::jsonb;
    return;
  end if;

  select wrong_indexes, reviewed_indexes
  into v_wrong, v_reviewed
  from public.user_attempts
  where id = p_attempt_id
    and device_id = v_device_id
  limit 1;

  if not found then
    return query select 404, null::jsonb;
    return;
  end if;

  v_wrong := coalesce(v_wrong, '[]'::jsonb);
  if not exists (
    select 1
    from jsonb_array_elements(v_wrong) x
    where (x #>> '{}') ~ '^\d+$'
      and (x #>> '{}')::integer = p_question_index
  ) then
    return query select 400, null::jsonb;
    return;
  end if;

  v_reviewed := coalesce(v_reviewed, '[]'::jsonb);
  if not exists (
    select 1
    from jsonb_array_elements(v_reviewed) x
    where (x #>> '{}') ~ '^\d+$'
      and (x #>> '{}')::integer = p_question_index
  ) then
    v_reviewed := v_reviewed || to_jsonb(p_question_index);
  end if;

  update public.user_attempts
  set reviewed_indexes = v_reviewed
  where id = p_attempt_id
    and device_id = v_device_id;

  return query select 200, v_reviewed;
end;
$$;

revoke all on function public.attempt_submit_session(text, uuid, text, text, integer, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.attempt_list_session(text) from public, anon, authenticated;
revoke all on function public.attempt_review_session(text, uuid, integer) from public, anon, authenticated;

grant execute on function public.attempt_submit_session(text, uuid, text, text, integer, boolean, jsonb) to anon;
grant execute on function public.attempt_list_session(text) to anon;
grant execute on function public.attempt_review_session(text, uuid, integer) to anon;