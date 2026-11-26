create table public.finance_ledgers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null check (jsonb_typeof(data) = 'object'),
 version bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.finance_ledgers enable row level security;
grant select, insert, update on public.finance_ledgers to authenticated;
create policy own_ledger on public.finance_ledgers to authenticated
 using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id);
create or replace function public.save_finance_ledger(expected bigint, next_data jsonb)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Unauthorized'; end if;
 if expected = 0 then
  insert into public.finance_ledgers(user_id,data) values (auth.uid(),next_data)
  on conflict do nothing;
 else
  update public.finance_ledgers set data=next_data,version=version+1,updated_at=now()
  where user_id=auth.uid() and version=expected;
 end if;
 return found;
end;
$$;
revoke execute on function public.save_finance_ledger(bigint,jsonb) from public, anon;
grant execute on function public.save_finance_ledger(bigint,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('receipts','receipts',false,4000000,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy own_receipts on storage.objects to authenticated
 using (bucket_id='receipts' and (storage.foldername(name))[1]=(select auth.uid()::text))
 with check (bucket_id='receipts' and (storage.foldername(name))[1]=(select auth.uid()::text));
