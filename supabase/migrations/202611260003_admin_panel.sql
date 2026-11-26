create table finance_private.administrators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table finance_private.administrators enable row level security;

create function public.is_finance_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from finance_private.administrators
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_finance_admin() from public, anon;
grant execute on function public.is_finance_admin() to authenticated;

create function public.finance_admin_users(page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  metrics jsonb;
  users_page jsonb;
begin
  if not public.is_finance_admin() then
    raise exception 'Acceso exclusivo para administradores.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'registered', count(*),
    'confirmed', count(email_confirmed_at),
    'active_last_30_days', count(*) filter (where last_sign_in_at >= now() - interval '30 days')
  ) into metrics from auth.users where deleted_at is null;

  select coalesce(jsonb_agg(to_jsonb(account) order by account.created_at desc nulls last, account.id desc), '[]'::jsonb)
    into users_page
    from (
      select id, email, created_at, email_confirmed_at, last_sign_in_at
      from auth.users
      where deleted_at is null
      order by created_at desc nulls last, id desc
      limit 30 offset greatest(coalesce(page_offset, 0), 0)
    ) as account;

  return jsonb_build_object('metrics', metrics, 'users', users_page);
end;
$$;
revoke all on function public.finance_admin_users(integer) from public, anon;
grant execute on function public.finance_admin_users(integer) to authenticated;
