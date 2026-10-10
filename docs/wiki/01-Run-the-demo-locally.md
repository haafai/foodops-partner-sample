# Run the demo locally

At the end of this page you have the mock API and the ordering app running on your machine, and you have placed
an order and moved it through its statuses.

## Before you start

- Node 22 or later (`node --version`). The repository pins it in `.nvmrc` and in `package.json`.
- Ports 4010 and 5180 free on your machine.
- No key and no restaurant: this page uses the mock and one of its built-in test keys.

## Steps

1. Install the dependencies, from the repository root.

   ```bash
   npm install
   ```

2. Start the mock API. Leave it running in its own terminal.

   ```bash
   npm run mock
   ```

   Expect:

   ```text
   Partner API mock listening on http://127.0.0.1:4010
   Built-in keys (fixtures, not secrets):
     hbk_test_mockfull0001_fullscopes  (full access)
     hbk_test_mockmenu0001_menuonly  (menu only)
     hbk_test_mockunbd0001_unbound  (not bound to a partner)
     hbk_test_mockfull0002_secondkey  (full access, second key)
   Restaurant simulator: http://127.0.0.1:4010/_mock/state
   ```

3. Start the demo in a second terminal.

   ```bash
   npm run dev
   ```

   Expect a line that reads `Local:   http://localhost:5180/`. If it names another port, 5180 was taken; the app
   still works, and [Troubleshooting](Troubleshooting.md#the-demo-started-on-a-port-other-than-5180) explains what
   changes for webhooks.

4. Open `http://localhost:5180/` in a browser. You land on the Setup screen, titled "Connect to a restaurant". The
   Base URL field already holds `http://127.0.0.1:4010`.

5. Type `hbk_test_mockfull0001_fullscopes` into the API key field and press **Save and continue**. The app shows
   two restaurants: Marine Drive, marked "Open · Accepting orders", and Lagoon Kiosk, marked "Closed · Not accepting
   orders". A green pill in the header reads "Mock".

6. Open Marine Drive. The menu shows three categories (Burgers, Drinks, Sides) and a line that reads
   `Prices from “Partner +15%” · MVR · tax included`.

7. Press **Add** next to Veggie Burger, then **Go to checkout**. The checkout shows your order, an estimate of
   85.00, and a "Developer: retry key" box holding the idempotency key the order will be sent with.

8. Press **Place order**. The tracking page opens with the heading "Waiting for Marine Drive to accept", the
   reference `SO-10001`, the status `pending`, and the line "Checking every 5 s."

9. In the "Restaurant simulator (mock only)" box at the bottom, press **Accept**, then **Advance** three times.
   The status moves through `accepted`, `preparing`, `ready` and `picked_up`, and the polling line changes to
   "Final status; polling stopped."

## Check it worked

Ask the mock what it holds:

```bash
curl -s http://127.0.0.1:4010/_mock/state
```

The answer lists your order with `"reference":"SO-10001"` and `"status":"picked_up"`.

## Next

- [Get and store your key](02-Get-and-store-your-key.md) to understand what the key you typed may do.
- [Use the mock server](09-Use-the-mock-server.md) for everything else the simulator can do.
