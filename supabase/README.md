# Supabase setup

One workspace shared by two named people. No public signup, no invite flow, no
membership UI — accounts are created here once and never again.

## 1. Create the project

At [supabase.com](https://supabase.com) → **New project**. Pick a region close
to you (Frankfurt for Türkiye). Save the database password somewhere safe; you
will not need it for the app, only for direct SQL access.

## 2. Run the migration

**SQL Editor** → paste all of `migrations/0001_init.sql` → **Run**. It creates
the tables, the row-level-security policies and the `updated_at` triggers.

## 3. Turn off public signup

**Authentication → Providers → Email**: leave *Email* enabled, switch
**"Allow new users to sign up"** off, and switch **"Confirm email"** off (there
is no mailbox behind the internal addresses below).

This is what stops a stranger who finds the URL from creating an account.

## 4. Create the two accounts

**Authentication → Users → Add user → Create new user**, twice. Tick *Auto
Confirm User*.

| Username in the app | Email to enter here | Password |
| --- | --- | --- |
| `Yahya123` | `yahya123@akif-cpg.app` | a long random one, temporary |
| `Akif123` | `akif123@akif-cpg.app` | a long random one, temporary |

The domain is internal and never receives mail; the app builds these addresses
from the username so nobody has to type an email.

Give each person their temporary password once. On first login the app forces
them to set their own, and from then on nobody knows anyone else's.

## 5. Create the workspace and add both people

**SQL Editor**, run this once:

```sql
insert into workspaces (name) values ('Akif CPG') returning id;
-- copy the id it prints into both statements below

insert into workspace_members (workspace_id, user_id, role)
select '<workspace-id>', id, 'owner' from auth.users where email = 'yahya123@akif-cpg.app';

insert into workspace_members (workspace_id, user_id, role)
select '<workspace-id>', id, 'editor' from auth.users where email = 'akif123@akif-cpg.app';

insert into workspace_settings (workspace_id) values ('<workspace-id>');
```

## 6. Tell the app where to look

**Project Settings → API Keys**: copy the *publishable* key, and take the
project URL from the project home page, into `.env.local` at the repo root:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The same two go into Vercel's environment variables for the deployed site.
There is no workspace id to configure: the app reads it from the signed-in
user's membership, so it cannot drift out of sync with the database.

The publishable key is **meant** to be public — it ships inside the browser
bundle and identifies the project, nothing more. Every row is protected by the
policies in the migration, which is why step 2 matters more than keeping this
key secret. The *secret* key on the same page is the dangerous one: it bypasses
row-level security, so it must never appear in this repo, in `.env.local`, or
in Vercel.

## Checking the policies actually work

In the SQL editor, impersonating a signed-in user:

```sql
-- as a member: rows come back
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'akif123@akif-cpg.app'))::text,
  true);
select count(*) from products;

-- as a stranger: zero rows, no error
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
select count(*) from products;
```

The second query returning `0` rather than an error is the correct result:
row-level security hides rows, it does not announce that they exist.
