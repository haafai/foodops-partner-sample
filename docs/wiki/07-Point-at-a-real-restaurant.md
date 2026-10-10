# Point at a real restaurant

At the end of this page the scenarios, and optionally the demo and the receiver, are talking to a test restaurant
instead of the mock.

> These steps were checked against the mock in this repository, by putting the mock's address and test key where
> the restaurant's go. No real API was contacted. The real API follows [`CONTRACT.md`](../../CONTRACT.md).

## Before you start

- Everything working against the mock: [Run the demo locally](01-Run-the-demo-locally.md) and
  [Run the scenarios](08-Run-the-scenarios.md).
- From the restaurant: a base URL and a **test** key (`hbk_test_…`) for a **test** restaurant.

## What to check first

Ask the restaurant these before you run anything:

- **Is this a test restaurant?** The scenarios place and cancel real orders. Never run them with a live key.
- **Which scopes does the key carry?** You need `menu.read` and `orders.write`, and `partner.webhook` for webhooks.
- **Is the key restricted to some outlets?** A restricted key cannot register a webhook.
- **Is there an IP allow-list on the key?** If so, give the restaurant the address your calls come from, or they
  answer `403 ip_not_allowed`.
- **Has the restaurant enabled partner ordering?** If not, calls answer `403 endpoint_not_available`.
- **Is a webhook already registered for you at this restaurant?** There is one per restaurant. Registering from
  your machine replaces it and stops its secret.

## Steps

1. Put the restaurant's values in `.env`, from the repository root.

   ```bash
   cp .env.example .env
   ```

   Edit `PARTNER_API_BASE_URL` and `PARTNER_API_KEY`. The base URL is the address without
   `/api/external/v1/partner`; the tools forgive that path if you paste it.

2. Make one read-only call.

   ```bash
   set -a; . ./.env; set +a
   curl -s "$PARTNER_API_BASE_URL/api/external/v1/partner/outlets" -H "Authorization: Bearer $PARTNER_API_KEY"
   ```

   Expect a JSON list with at least one outlet. An empty list means the restaurant has not assigned any outlet to
   your key. An error body names the problem: look the code up in [Troubleshooting](Troubleshooting.md).

3. Run the two read-only scenarios.

   ```bash
   npm run scenarios -- --only outlets.list,menu.etag
   ```

   ```text
   PASS  outlets.list
   PASS  menu.etag

   2 passed, 0 failed, 0 skipped
   ```

   The line above the results names the target and shows only the key's id. Against a restaurant its
   `capabilities` list does not contain `mock-control`; if it does, you are still pointed at the mock.

4. Run every scenario.

   ```bash
   npm run scenarios
   ```

   Scenarios that need the mock's simulator report `SKIP`. How to read the result, and how to give the runner a
   closed outlet, extra keys and a webhook URL, is in [Run the scenarios](08-Run-the-scenarios.md).

5. Optional: use the demo. Start it with `npm run dev`, open the Setup screen, enter the restaurant's base URL and
   test key, and press **Save and continue**. The header pill reads "Local" instead of "Mock", and the restaurant
   simulator no longer appears on the tracking page: the restaurant's own staff move the order.

## The demo's browser-origin limit

The demo calls the API from the page. A browser only allows that when the API names the page's origin
(`http://localhost:5180`) as allowed, and a real restaurant's API may not. When it does not, every call from the
demo fails in the browser although the same call with `curl` works. That is a limit of the demo, not a fault in
your key. Use the scenarios and `curl`, which call from your machine, as your own server will.

The demo also refuses to save a live key (`hbk_live_…`) unless the base URL is https and is not `localhost` or
`127.0.0.1`. It shows: "A live key may only be used over https against a production host. Use a test key here."

## Webhooks at a real restaurant

The Webhooks card on the Setup screen behaves differently away from the mock:

- It refuses a webhook URL that is not https or that names this machine, with: "A restaurant only accepts an https
  URL on a public host. Put a tunnel in front of the receiver's webhook port and paste its https address here."
  Follow [Expose your receiver](06-Expose-your-receiver.md) to get such an address.
- If a webhook is already registered and points somewhere other than the URL in the card, the card says so in red
  and names the host. That may be your production receiver. **Register again (new secret)** and **Remove webhook**
  then each need two presses: the first changes the button to "Yes, replace the webhook at *host*" or "Yes, remove
  the webhook at *host*" and explains what will stop; the second does it. Clicking anywhere else backs out.

Leave a webhook that points elsewhere alone unless it is yours to replace. The scenarios follow the same rule: they
skip their webhook checks when one is already registered.

## Check it worked

Step 3 printed two `PASS` lines, and the target line did not list `mock-control`.

## Next

- [Run the scenarios](08-Run-the-scenarios.md)
- [Go-live checklist](10-Go-live-checklist.md)
