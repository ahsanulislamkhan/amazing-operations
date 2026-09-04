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
    where state in ('pending', 'failed')
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

create or replace function public.finish_email_outbox(
  outbox_id uuid,
  delivery_succeeded boolean,
  message_id text default null,
  failure_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_outbox
  set
    state = case when delivery_succeeded then 'sent' else 'failed' end,
    provider_message_id = case when delivery_succeeded then message_id else provider_message_id end,
    last_error = case when delivery_succeeded then null else left(coalesce(failure_message, 'Unknown delivery error'), 2000) end,
    sent_at = case when delivery_succeeded then now() else sent_at end,
    next_attempt_at = case when delivery_succeeded then next_attempt_at else now() + make_interval(mins => least(360, power(2, attempt_count)::integer)) end
  where id = outbox_id;
end;
$$;

revoke all on function public.claim_email_outbox(integer) from public;
revoke all on function public.claim_email_outbox(integer) from authenticated;
revoke all on function public.finish_email_outbox(uuid, boolean, text, text) from public;
revoke all on function public.finish_email_outbox(uuid, boolean, text, text) from authenticated;
grant execute on function public.claim_email_outbox(integer) to service_role;
grant execute on function public.finish_email_outbox(uuid, boolean, text, text) to service_role;
