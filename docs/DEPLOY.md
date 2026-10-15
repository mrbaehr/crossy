# Deploy (Fly.io)

Single machine, single persistent volume for SQLite. One deployable (server serves the
built client). Litestream backups are deferred (issue #6).

## One-time setup

```bash
fly apps create crossy-app
fly volumes create crossy_data --region dfw --size 1   # 1 GB SQLite volume
fly secrets set SESSION_SECRET="$(openssl rand -hex 32)"
fly secrets set USERS="max:<password>,nick:<password>"
```

- `SESSION_SECRET` signs session cookies. Rotating it logs everyone out.
- `USERS` seeds the login accounts on boot (`username:password`, comma-separated).
  Plaintext is hashed on boot; a pre-hashed `scrypt$…` value is also accepted.
  There is no self-registration, so these two accounts are the entire allowlist.

## Deploy

```bash
fly deploy
```

Migrations run automatically on boot (`server/src/index.ts`). The SQLite file lives at
`/data/crossy.db` on the mounted volume and persists across deploys and restarts.

## Health / logs

```bash
fly status
fly logs
curl https://crossy-app.fly.dev/api/health
```

## Changing passwords

Update the `USERS` secret and redeploy (boot re-seeds / updates the password hash):

```bash
fly secrets set USERS="max:<newpw>,nick:<newpw>"
```

## Not yet set up

- Litestream backup of SQLite to object storage (#6).
- Deploy-on-main CI (#7) — currently deploy is manual (`fly deploy`).
