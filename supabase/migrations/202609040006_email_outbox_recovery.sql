create or replace function public.claim_email_outbox(batch_size integer default 20)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select id
    from public.email_outbox
    where (
        state in ('pending', 'failed')
        or (state = 'processing' and updated_at < now() - interval '15 minutes')
      )
      and next_attempt_at <= now()
      and attempt_count < 8
    order by created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.email_outbox outbox
  set state = 'processing', attempt_count = attempt_count + 1
  from claimed
  where outbox.id = claimed.id
  returning outbox.*;
end;
$$;

revoke all on function public.claim_email_outbox(integer) from public;
revoke all on function public.claim_email_outbox(integer) from authenticated;
grant execute on function public.claim_email_outbox(integer) to service_role;
