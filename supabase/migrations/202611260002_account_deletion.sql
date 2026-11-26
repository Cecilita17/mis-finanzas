create schema finance_private;
grant usage on schema finance_private to authenticated;

create function finance_private.can_write_receipt()
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(account_id::text, 2802));
  return exists (select 1 from auth.users where id = account_id);
end;
$$;
revoke all on function finance_private.can_write_receipt() from public, anon;
grant execute on function finance_private.can_write_receipt() to authenticated;

create policy receipts_require_active_account on storage.objects
 as restrictive for all to authenticated
 using (true)
 with check (bucket_id <> 'receipts' or (select finance_private.can_write_receipt()));

create function public.delete_finance_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null or not exists (
    select 1 from auth.sessions s
    where s.user_id = account_id
      and s.id::text = (auth.jwt() ->> 'session_id')
      and s.created_at > now() - interval '5 minutes'
  ) then
    raise exception 'Volvé a verificar tu contraseña para eliminar la cuenta.'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(account_id::text, 2802));

  if exists (
    select 1 from storage.objects
    where bucket_id = 'receipts' and (storage.foldername(name))[1] = account_id::text
  ) then
    raise exception 'Todavía hay comprobantes en la cuenta. Volvé a intentar.'
      using errcode = '23514';
  end if;

  delete from auth.users where id = account_id;
end;
$$;
revoke all on function public.delete_finance_account() from public, anon;
grant execute on function public.delete_finance_account() to authenticated;
