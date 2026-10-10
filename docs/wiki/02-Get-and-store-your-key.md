# Get and store your key

At the end of this page your key is in a `.env` file that the tools in this repository read, and you know what the
key may and may not do.

## Before you start

- The repository installed: [Run the demo locally](01-Run-the-demo-locally.md), step 1.
- Either the mock running (`npm run mock`), or a base URL and a key from a restaurant.

## What a restaurant gives you

Two things, per restaurant:

- **A base URL**: the address of that restaurant's API, without the `/api/external/v1/partner` path.
- **A key**: a string of the form `hbk_<env>_<id>_<secret>`. `<env>` is `test` or `live`. `<id>` is 12 characters
  and is the only part you may show or log.

You get **one key per restaurant**. A key for one restaurant shows you nothing at another, so store them per
restaurant and never share one across restaurants.

A key carries scopes. Ask the restaurant for the ones you need:

| Scope | Lets you |
|---|---|
| `menu.read` | List outlets and read menus. |
| `orders.write` | Create, read and cancel orders. |
| `partner.webhook` | Register, read and remove your webhook. |

A call without the scope it needs answers `403 insufficient_scope`. The scope for each endpoint is in the
[`CONTRACT.md` endpoint table](../../CONTRACT.md#endpoints).

A restaurant can also restrict a key to some of its outlets. Such a key cannot register a webhook; see
[Troubleshooting](Troubleshooting.md#403-outlet_restricted_key).

## Steps

1. Copy the example settings file, from the repository root.

   ```bash
   cp .env.example .env
   ```

   The copy already points at the mock and holds the mock's full-access test key:

   ```text
   PARTNER_API_BASE_URL=http://127.0.0.1:4010
   PARTNER_API_KEY=hbk_test_mockfull0001_fullscopes
   ```

2. If you have a key from a restaurant, edit `.env` and replace both values with the base URL and the key the
   restaurant gave you. If you are using the mock, leave the file as it is.

3. Confirm that git will not pick the file up.

   ```bash
   git status --short
   ```

   Expect no line for `.env`: the repository's `.gitignore` excludes it.

4. Check that the key works. This loads `.env` into your shell and lists the outlets.

   ```bash
   set -a; . ./.env; set +a
   curl -s "$PARTNER_API_BASE_URL/api/external/v1/partner/outlets" -H "Authorization: Bearer $PARTNER_API_KEY"
   ```

   Against the mock, expect two outlets:

   ```text
   [{"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","name":"Marine Drive", ... ,"acceptingOrders":true,"acceptTimeoutMinutes":10},
    {"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c02","name":"Lagoon Kiosk", ... ,"acceptingOrders":false,"acceptTimeoutMinutes":15}]
   ```

## Who reads `.env`

| Tool | Reads the root `.env`? |
|---|---|
| `npm run scenarios` | Yes: `PARTNER_API_BASE_URL`, `PARTNER_API_KEY`, `PARTNER_WEBHOOK_URL`, `PARTNER_WEBHOOK_LISTEN_PORT`. |
| `npm run receiver` | Yes: `WEBHOOK_PORT`, `WEBHOOK_CONTROL_PORT`, `WEBHOOK_ALLOWED_ORIGINS`, `PARTNER_WEBHOOK_SECRET`. |
| `npm run mock` | No. It listens on port 4010, or on the port in the `PORT` environment variable. |
| `npm run dev` | No. You type the base URL and key into the Setup screen. |

The demo can be pre-filled for local development by exporting `VITE_PARTNER_API_BASE_URL` and
`VITE_PARTNER_API_KEY` in the shell before `npm run dev`. Those values are compiled into the page, so never set
`VITE_PARTNER_API_KEY` for a build that anyone else can load.

## What never to commit, log or share

- The key. Send it only in the `Authorization: Bearer` header, never in a URL. Log only its id; the client's
  `redactKey()` turns `hbk_test_mockfull0001_fullscopes` into `hbk_test_mockfull0001_…`.
- The webhook signing secret (`whsec_…`) that a webhook registration returns. Treat it exactly like the key.
- Your `.env` file.

The four `hbk_test_mock…` keys printed by the mock are fixtures. They work only against the mock and are safe to
paste anywhere.

In production the key lives in a secret store on your server. The demo keeps it in the browser tab's session
storage, which is acceptable only for a development tool.

## Check it worked

Step 4 printed a JSON list of outlets, and step 3 printed nothing for `.env`.

## Next

- [Sync a menu](03-Sync-a-menu.md)
- [Point at a real restaurant](07-Point-at-a-real-restaurant.md) when you have a key from one.
